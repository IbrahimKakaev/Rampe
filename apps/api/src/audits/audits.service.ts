import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type AuditStatus as RuleStatus,
  CLASSIFICATION,
  conformity,
  CORRECTIONS_FR,
  criterionById,
  CURRENT_REFERENTIAL,
  type Proposal,
  proposalsForPage,
} from '@rampe/rules';
import type {
  Audit,
  AuditSampleRequest,
  AuditSummary,
  Conformity,
  CriterionEvaluation,
  EvaluationRequest,
  Statement,
  StatementFields,
} from '@rampe/shared';

import type { ProposalKind } from '../generated/prisma/client.js';
import { Clock } from '../infra/clock.js';
import { Prisma } from '../infra/prisma.js';
import type { SessionUser } from '../security/request-context.js';
import { buildStatement } from './statement.js';

const CRITERIA = CURRENT_REFERENTIAL.criteria.map((criterion) => criterion.id);
const AUTOMATION = new Map(CLASSIFICATION.map((entry) => [entry.criterion, entry.automation]));
const THEMES = new Map(CURRENT_REFERENTIAL.themes.map((theme) => [theme.number, theme.title]));

const PROPOSAL: Readonly<Record<Proposal['kind'], ProposalKind>> = {
  'non-compliant': 'NON_COMPLIANT',
  'compliant-to-confirm': 'COMPLIANT_TO_CONFIRM',
  clue: 'CLUE',
};

const EMPTY_FIELDS: StatementFields = {
  entityName: '',
  serviceName: '',
  auditedBy: '',
  derogations: '',
  exemptions: '',
  technologies: '',
  testEnvironment: '',
  tools: '',
  contactFormUrl: '',
  contactDetails: '',
  multiYearPlanUrl: '',
  actionPlanUrl: '',
};

/** The conformity of a sample, by the official method, from the recorded statuses. */
function conformityOf(
  pages: readonly {
    id: string;
    results: readonly { criterion: string; status: RuleStatus | null }[];
  }[],
): Conformity {
  const results = Object.fromEntries(
    pages.map((page) => [
      page.id,
      Object.fromEntries(
        page.results.flatMap((result) =>
          result.status === null ? [] : [[result.criterion, result.status]],
        ),
      ),
    ]),
  );
  return conformity(
    CRITERIA,
    pages.map((page) => page.id),
    results,
  );
}

/**
 * Manual audits: the sample of pages, the status of each of the 106 criteria
 * on each page, the conformity rate by the official method, and the
 * accessibility statement. The automated results of the reference scan
 * propose statuses (packages/rules, audit.ts); only a defect found counts as
 * a status without the auditor, never a conformity.
 */
@Injectable()
export class AuditsService {
  constructor(
    private readonly prisma: Prisma,
    private readonly clock: Clock,
  ) {}

  async create(
    organizationId: string,
    siteId: string,
    scanId: string,
    user: SessionUser,
  ): Promise<Audit> {
    const scan = await this.prisma.scan.findFirst({
      where: { id: scanId, siteId, organizationId },
    });
    if (scan === null) {
      throw new NotFoundException('Scan introuvable');
    }
    if (scan.status !== 'COMPLETED' && scan.status !== 'PARTIAL') {
      throw new ConflictException('Un audit part d’un scan terminé.');
    }
    const audit = await this.prisma.audit.create({
      data: {
        organizationId,
        siteId,
        scanId,
        referentialVersion: CURRENT_REFERENTIAL.version,
        createdById: user.id,
      },
    });
    return this.get(organizationId, audit.id);
  }

  async list(organizationId: string, siteId: string): Promise<AuditSummary[]> {
    const site = await this.prisma.site.findFirst({ where: { id: siteId, organizationId } });
    if (site === null) {
      throw new NotFoundException('Site introuvable');
    }
    const audits = await this.prisma.audit.findMany({
      where: { organizationId, siteId },
      orderBy: { createdAt: 'desc' },
      include: { pages: { include: { results: { select: { criterion: true, status: true } } } } },
    });
    return audits.map((audit) => ({
      id: audit.id,
      createdAt: audit.createdAt.toISOString(),
      pageCount: audit.pages.length,
      conformity: conformityOf(audit.pages),
    }));
  }

  async get(organizationId: string, auditId: string): Promise<Audit> {
    const audit = await this.find(organizationId, auditId);
    return {
      id: audit.id,
      siteId: audit.siteId,
      scanId: audit.scanId,
      referentialVersion: audit.referentialVersion,
      createdAt: audit.createdAt.toISOString(),
      pages: audit.pages.map((page) => ({
        id: page.id,
        position: page.position,
        url: page.url,
        title: page.title,
        scanned: page.scanPageId !== null,
        evaluated: page.results.filter((result) => result.status !== null).length,
        expected: CRITERIA.length,
      })),
      conformity: conformityOf(audit.pages),
    };
  }

  async conformity(organizationId: string, auditId: string): Promise<Conformity> {
    return conformityOf((await this.find(organizationId, auditId)).pages);
  }

  /**
   * Replaces the sample. A page kept (same address) keeps its evaluations; a
   * new page of the reference scan receives the proposals of the automated
   * results.
   */
  async setSample(
    organizationId: string,
    auditId: string,
    sample: AuditSampleRequest,
  ): Promise<Audit> {
    const audit = await this.find(organizationId, auditId);
    const urls = sample.pages.map((page) => page.url);
    if (new Set(urls).size !== urls.length) {
      throw new BadRequestException('Une même page figure deux fois dans l’échantillon.');
    }
    const scanPages =
      audit.scanId === null
        ? []
        : await this.prisma.scanPage.findMany({
            where: { organizationId, scanId: audit.scanId, url: { in: urls } },
            include: {
              findings: { select: { ruleId: true, rgaaCriteria: true, rgaaUncertain: true } },
            },
          });
    const scanned = new Map(scanPages.map((page) => [page.url, page]));
    const existing = new Map(audit.pages.map((page) => [page.url, page]));

    await this.prisma.$transaction(async (tx) => {
      await tx.auditPage.deleteMany({ where: { auditId, url: { notIn: urls } } });
      for (const [position, { url, title }] of sample.pages.entries()) {
        const kept = existing.get(url);
        if (kept !== undefined) {
          await tx.auditPage.update({ where: { id: kept.id }, data: { position, title } });
          continue;
        }
        const scanPage = scanned.get(url);
        const page = await tx.auditPage.create({
          data: { organizationId, auditId, position, url, title, scanPageId: scanPage?.id ?? null },
        });
        if (scanPage === undefined) {
          continue;
        }
        const proposals = proposalsForPage({
          analyzed: scanPage.status === 'ANALYZED',
          passedRules: scanPage.passedRules,
          findings: scanPage.findings.map((finding) => ({
            ruleId: finding.ruleId,
            criteria: finding.rgaaCriteria,
            uncertain: finding.rgaaUncertain,
          })),
        });
        await tx.auditResult.createMany({
          data: [...proposals].map(([criterion, proposal]) => ({
            organizationId,
            auditPageId: page.id,
            criterion,
            // Only a defect found is a status of its own; a conformity waits for the auditor.
            status: proposal.kind === 'non-compliant' ? ('NC' as const) : null,
            origin: proposal.kind === 'non-compliant' ? ('AUTOMATIC' as const) : null,
            proposal: PROPOSAL[proposal.kind],
            proposalRules: [...proposal.rules],
          })),
        });
      }
    });
    return this.get(organizationId, auditId);
  }

  /** The 106 criteria on one page of the sample, with their status and what is proposed. */
  async criteria(
    organizationId: string,
    auditId: string,
    pageId: string,
  ): Promise<CriterionEvaluation[]> {
    const page = await this.findPage(organizationId, auditId, pageId);
    const results = new Map(page.results.map((result) => [result.criterion, result]));
    return CURRENT_REFERENTIAL.criteria.map((criterion) =>
      this.toEvaluation(criterion.id, results.get(criterion.id)),
    );
  }

  async evaluate(
    organizationId: string,
    auditId: string,
    pageId: string,
    criterionId: string,
    request: EvaluationRequest,
    user: SessionUser,
  ): Promise<CriterionEvaluation> {
    if (criterionById(criterionId) === undefined) {
      throw new NotFoundException('Critère introuvable');
    }
    const page = await this.findPage(organizationId, auditId, pageId);
    const current = page.results.find((result) => result.criterion === criterionId);
    const note = request.note === null || request.note === '' ? null : request.note;
    if (
      current?.origin === 'AUTOMATIC' &&
      current.status === 'NC' &&
      request.status !== 'NC' &&
      note === null
    ) {
      throw new BadRequestException(
        'Un défaut a été détecté sur cette page pour ce critère : expliquez dans la note pourquoi le critère n’est pas non conforme.',
      );
    }
    const data = {
      status: request.status,
      origin: request.status === null ? null : ('AUDITOR' as const),
      note,
      authorId: user.id,
    };
    const saved = await this.prisma.auditResult.upsert({
      where: { auditPageId_criterion: { auditPageId: page.id, criterion: criterionId } },
      create: { organizationId, auditPageId: page.id, criterion: criterionId, ...data },
      update: data,
      include: { author: { select: { name: true } } },
    });
    return this.toEvaluation(criterionId, saved);
  }

  async statement(organizationId: string, auditId: string): Promise<Statement> {
    const audit = await this.find(organizationId, auditId);
    const stored = await this.prisma.statement.findUnique({ where: { auditId } });
    const fields: StatementFields =
      stored === null
        ? {
            ...EMPTY_FIELDS,
            entityName: audit.organization.name,
            serviceName: audit.site.host,
          }
        : {
            entityName: stored.entityName,
            serviceName: stored.serviceName,
            auditedBy: stored.auditedBy,
            derogations: stored.derogations,
            exemptions: stored.exemptions,
            technologies: stored.technologies,
            testEnvironment: stored.testEnvironment,
            tools: stored.tools,
            contactFormUrl: stored.contactFormUrl,
            contactDetails: stored.contactDetails,
            multiYearPlanUrl: stored.multiYearPlanUrl,
            actionPlanUrl: stored.actionPlanUrl,
          };
    const nonConforming = CRITERIA.flatMap((id) => {
      const results = audit.pages.flatMap((page) =>
        page.results
          .filter((result) => result.criterion === id && result.status === 'NC')
          .map((result) => ({ page, note: result.note })),
      );
      if (results.length === 0) {
        return [];
      }
      return [
        {
          id,
          title: criterionById(id)?.title ?? '',
          notes: results.flatMap(({ page, note }) =>
            note === null ? [] : [`${page.title} : ${note}`],
          ),
        },
      ];
    });
    const updates = audit.pages.flatMap((page) =>
      page.results
        .filter((result) => result.status !== null)
        .map((result) => result.updatedAt.getTime()),
    );
    return {
      fields,
      ...buildStatement({
        fields,
        siteOrigin: audit.site.origin,
        referentialVersion: audit.referentialVersion,
        conformity: conformityOf(audit.pages),
        nonConforming,
        pages: audit.pages.map(({ title, url }) => ({ title, url })),
        lastEvaluationAt: updates.length === 0 ? null : new Date(Math.max(...updates)),
        generatedAt: this.clock.now(),
        axeVersion: audit.scan?.axeVersion ?? null,
      }),
    };
  }

  async saveStatement(
    organizationId: string,
    auditId: string,
    fields: StatementFields,
  ): Promise<Statement> {
    await this.find(organizationId, auditId);
    await this.prisma.statement.upsert({
      where: { auditId },
      create: { organizationId, auditId, ...fields },
      update: fields,
    });
    return this.statement(organizationId, auditId);
  }

  private toEvaluation(
    criterionId: string,
    result:
      | {
          status: RuleStatus | null;
          origin: 'AUTOMATIC' | 'AUDITOR' | null;
          note: string | null;
          proposal: ProposalKind | null;
          proposalRules: string[];
          updatedAt: Date;
          author?: { name: string } | null;
        }
      | undefined,
  ): CriterionEvaluation {
    const criterion = criterionById(criterionId);
    const theme = criterion?.theme ?? 0;
    return {
      criterion: criterionId,
      theme,
      themeTitle: THEMES.get(theme) ?? '',
      title: criterion?.title ?? '',
      automation: AUTOMATION.get(criterionId) ?? 'manual',
      status: result?.status ?? null,
      origin: result?.origin ?? null,
      note: result?.note ?? null,
      proposal: result?.proposal ?? null,
      proposalRules: (result?.proposalRules ?? []).map((ruleId) => ({
        ruleId,
        title: CORRECTIONS_FR[ruleId]?.title ?? null,
      })),
      author:
        result?.status === null || result?.origin !== 'AUDITOR'
          ? null
          : (result.author?.name ?? null),
      updatedAt:
        result?.status === null || result === undefined ? null : result.updatedAt.toISOString(),
    };
  }

  private async find(organizationId: string, auditId: string) {
    const audit = await this.prisma.audit.findFirst({
      where: { id: auditId, organizationId },
      include: {
        organization: { select: { name: true } },
        site: { select: { origin: true, host: true } },
        scan: { select: { axeVersion: true } },
        pages: {
          orderBy: { position: 'asc' },
          include: { results: true },
        },
      },
    });
    if (audit === null) {
      throw new NotFoundException('Audit introuvable');
    }
    return audit;
  }

  private async findPage(organizationId: string, auditId: string, pageId: string) {
    const page = await this.prisma.auditPage.findFirst({
      where: { id: pageId, auditId, organizationId },
      include: { results: { include: { author: { select: { name: true } } } } },
    });
    if (page === null) {
      throw new NotFoundException('Page de l’échantillon introuvable');
    }
    return page;
  }
}
