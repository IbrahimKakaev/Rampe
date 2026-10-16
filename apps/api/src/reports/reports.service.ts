import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CLASSIFICATION,
  compareRgaaIds,
  CORRECTIONS_FR,
  criteriaToCheckManually,
  criterionById,
  CURRENT_REFERENTIAL,
} from '@rampe/rules';
import { PAGE_ERROR_LABEL, type PageError, SCAN_DEFAULTS, scanReasonLabel } from '@rampe/shared';

import { Clock } from '../infra/clock.js';
import { Prisma } from '../infra/prisma.js';
import { Queues } from '../infra/queues.js';
import { buildReportHtml, type ReportData, type ReportFinding } from './report-html.js';

export interface Report {
  readonly pdf: Buffer;
  readonly filename: string;
}

/** The criteria the automated pre-audit cannot decide, by theme, as the report lists them. */
function manualCriteria(): ReportData['manualCriteria'] {
  const themes = new Map<number, ReportData['manualCriteria'][number]['criteria'][number][]>();
  for (const entry of CLASSIFICATION) {
    const criterion = criterionById(entry.criterion);
    if (entry.automation === 'automatable' || criterion === undefined) {
      continue;
    }
    themes.set(criterion.theme, [
      ...(themes.get(criterion.theme) ?? []),
      { id: criterion.id, title: criterion.title, partial: entry.automation === 'partial' },
    ]);
  }
  return CURRENT_REFERENTIAL.themes.flatMap((theme) => {
    const criteria = themes.get(theme.number);
    return criteria === undefined
      ? []
      : [{ theme: `${String(theme.number)}. ${theme.title}`, criteria }];
  });
}

/**
 * The pre-audit report of a scan, as a PDF. It is produced on each request and
 * never stored: the API writes its HTML, the worker prints it in the isolated
 * browser.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: Prisma,
    private readonly queues: Queues,
    private readonly clock: Clock,
  ) {}

  async pdf(organizationId: string, scanId: string): Promise<Report> {
    const html = await this.html(organizationId, scanId);
    const { host, date } = html;
    return {
      pdf: await this.queues.renderPdf(html.text),
      filename: `pre-audit-${host.replace(/[^a-z0-9.-]/gi, '-')}-${date}.pdf`,
    };
  }

  /** The HTML of the report, with what names the file. */
  async html(
    organizationId: string,
    scanId: string,
  ): Promise<{ text: string; host: string; date: string }> {
    const scan = await this.prisma.scan.findFirst({
      where: { id: scanId, organizationId },
      include: {
        site: true,
        organization: true,
        pages: {
          orderBy: { position: 'asc' },
          include: { findings: { orderBy: [{ ruleId: 'asc' }, { id: 'asc' }] } },
        },
      },
    });
    if (scan === null) {
      throw new NotFoundException('Scan introuvable');
    }
    const { finishedAt, score, checksPassed, checksFailed, checksIncomplete } = scan;
    if (
      (scan.status !== 'COMPLETED' && scan.status !== 'PARTIAL') ||
      finishedAt === null ||
      score === null ||
      checksPassed === null ||
      checksFailed === null ||
      checksIncomplete === null
    ) {
      throw new ConflictException('Le rapport n’est disponible que pour un scan terminé.');
    }

    const byCriterion = new Map<string, ReportFinding[]>();
    const unattached: ReportFinding[] = [];
    let findingCount = 0;
    for (const page of scan.pages) {
      for (const finding of page.findings) {
        findingCount += 1;
        const correction = CORRECTIONS_FR[finding.ruleId];
        const entry: ReportFinding = {
          ruleId: finding.ruleId,
          title: correction?.title ?? null,
          fix: correction?.fix ?? null,
          impact: finding.impact,
          pagePath: page.path,
          selector: finding.selector,
          html: finding.html,
          uncertain: finding.rgaaUncertain,
        };
        if (finding.rgaaCriteria.length === 0) {
          unattached.push(entry);
        }
        for (const criterion of finding.rgaaCriteria) {
          byCriterion.set(criterion, [...(byCriterion.get(criterion) ?? []), entry]);
        }
      }
    }

    const data: ReportData = {
      generatedAt: this.clock.now(),
      organizationName: scan.organization.name,
      site: { origin: scan.site.origin, host: scan.site.host },
      scan: {
        createdAt: scan.createdAt,
        finishedAt,
        status: scan.status,
        stopReason: scan.status === 'PARTIAL' ? scanReasonLabel(scan.reason) : null,
        score,
        checks: { passed: checksPassed, failed: checksFailed, incomplete: checksIncomplete },
        referentialVersion: scan.referentialVersion,
        axeVersion: scan.axeVersion,
        findingsAdded: scan.findingsAdded,
        findingsFixed: scan.findingsFixed,
        maxDepth: SCAN_DEFAULTS.maxDepth,
      },
      pages: scan.pages.map((page) => ({
        url: page.url,
        analyzed: page.status === 'ANALYZED',
        failure:
          page.error === null
            ? null
            : `${PAGE_ERROR_LABEL[page.error as PageError]}${page.httpStatus === null ? '' : ` (code HTTP ${String(page.httpStatus)})`}`,
        findingCount: page.findings.length,
      })),
      criteria: [...byCriterion.keys()].sort(compareRgaaIds).map((id) => ({
        id,
        title: criterionById(id)?.title ?? '',
        findings: byCriterion.get(id) ?? [],
      })),
      unattached,
      manualCriteria: manualCriteria(),
      criteriaToCheckManually: criteriaToCheckManually(),
      findingCount,
    };
    return {
      text: buildReportHtml(data),
      host: scan.site.host,
      date: finishedAt.toISOString().slice(0, 10),
    };
  }
}
