import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CORRECTIONS_FR,
  criteriaToCheckManually,
  criterionById,
  CURRENT_REFERENTIAL,
  rgaaLinksOf,
} from '@rampe/rules';
import {
  type Finding,
  type Impact,
  type PageError,
  SCAN_DEFAULTS,
  type Scan,
  type ScanPage,
} from '@rampe/shared';

import type { Finding as StoredFinding, Scan as StoredScan } from '../generated/prisma/client.js';
import { Prisma } from '../infra/prisma.js';
import { Queues } from '../infra/queues.js';
import { SitesService } from '../sites/sites.service.js';

const IMPACT_ORDER: readonly Impact[] = ['critical', 'serious', 'moderate', 'minor'];
const IMPACT_LABEL: Readonly<Record<Impact, string>> = {
  critical: 'Critique',
  serious: 'Grave',
  moderate: 'Modéré',
  minor: 'Mineur',
};

export interface FindingFilters {
  readonly ruleId?: string | undefined;
  readonly criterion?: string | undefined;
  readonly impact?: Impact | undefined;
  readonly pageId?: string | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

@Injectable()
export class ScansService {
  constructor(
    private readonly prisma: Prisma,
    private readonly sites: SitesService,
    private readonly queues: Queues,
  ) {}

  /**
   * Starts a scan of a verified site. The ownership proof is checked again
   * first; a site whose proof has disappeared is unverified and not scanned.
   */
  async start(organizationId: string, siteId: string): Promise<Scan> {
    const site = await this.sites.find(organizationId, siteId);
    if (site.verifiedAt === null) {
      throw new ConflictException('Vérifiez d’abord que ce site vous appartient.');
    }
    const running = await this.prisma.scan.count({
      where: { siteId, status: { in: ['QUEUED', 'RUNNING'] } },
    });
    if (running > 0) {
      throw new ConflictException('Un scan de ce site est déjà en cours.');
    }
    const proof = await this.sites.confirmOwnership(site);
    if (!proof.verified) {
      throw new ConflictException(`La preuve de propriété n’est plus en place : ${proof.detail}`);
    }
    const scan = await this.prisma.scan.create({
      data: {
        organizationId,
        siteId,
        trigger: 'MANUAL',
        referentialVersion: CURRENT_REFERENTIAL.version,
      },
    });
    await this.queues.enqueueScan({
      scanId: scan.id,
      url: `${site.origin}/`,
      limits: { ...SCAN_DEFAULTS, maxPages: site.maxPages },
    });
    return toScan(scan);
  }

  async list(organizationId: string, siteId: string): Promise<Scan[]> {
    await this.sites.find(organizationId, siteId);
    const scans = await this.prisma.scan.findMany({
      where: { organizationId, siteId },
      orderBy: { createdAt: 'desc' },
    });
    return scans.map(toScan);
  }

  async get(organizationId: string, scanId: string): Promise<Scan> {
    return toScan(await this.find(organizationId, scanId));
  }

  async pages(organizationId: string, scanId: string): Promise<ScanPage[]> {
    await this.find(organizationId, scanId);
    const pages = await this.prisma.scanPage.findMany({
      where: { organizationId, scanId },
      orderBy: { position: 'asc' },
      include: { _count: { select: { findings: true } } },
    });
    return pages.map((page) => ({
      id: page.id,
      position: page.position,
      url: page.url,
      path: page.path,
      depth: page.depth,
      status: page.status,
      error: page.error as PageError | null,
      httpStatus: page.httpStatus,
      title: page.title,
      findingCount: page._count.findings,
      truncated: page.truncated,
    }));
  }

  async findings(organizationId: string, scanId: string, filters: FindingFilters) {
    await this.find(organizationId, scanId);
    const where = {
      organizationId,
      scanId,
      ...(filters.ruleId === undefined ? {} : { ruleId: filters.ruleId }),
      ...(filters.impact === undefined ? {} : { impact: filters.impact }),
      ...(filters.pageId === undefined ? {} : { pageId: filters.pageId }),
      ...(filters.criterion === undefined ? {} : { rgaaCriteria: { has: filters.criterion } }),
    };
    const [total, items] = await Promise.all([
      this.prisma.finding.count({ where }),
      this.prisma.finding.findMany({
        where,
        include: { page: { select: { path: true } } },
        orderBy: [{ page: { position: 'asc' } }, { ruleId: 'asc' }, { id: 'asc' }],
        take: filters.limit ?? 100,
        skip: filters.offset ?? 0,
      }),
    ]);
    return { total, items: items.map((finding) => toFinding(finding, finding.page.path)) };
  }

  async finding(organizationId: string, scanId: string, findingId: string) {
    const finding = await this.prisma.finding.findFirst({
      where: { id: findingId, scanId, organizationId },
      include: { page: { select: { path: true, url: true } } },
    });
    if (finding === null) {
      throw new NotFoundException('Défaut introuvable');
    }
    return {
      ...toFinding(finding, finding.page.path),
      pageUrl: finding.page.url,
      fingerprint: finding.fingerprint,
      correction: CORRECTIONS_FR[finding.ruleId] ?? null,
    };
  }

  /** Counts of defects by RGAA criterion, by impact and by page. */
  async summary(organizationId: string, scanId: string) {
    await this.find(organizationId, scanId);
    const findings = await this.prisma.finding.findMany({
      where: { organizationId, scanId },
      select: { rgaaCriteria: true, impact: true, page: { select: { id: true, path: true } } },
    });
    const count = <K extends string>(keys: K[]): Map<K, number> =>
      keys.reduce((map, key) => map.set(key, (map.get(key) ?? 0) + 1), new Map<K, number>());

    const byCriterion = [...count(findings.flatMap((finding) => finding.rgaaCriteria))]
      .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
      .map(([key, value]) => ({
        key,
        label: `${key} ${criterionById(key)?.title ?? ''}`.trim(),
        count: value,
      }));
    const impacts = count(findings.map((finding) => (finding.impact ?? 'minor') as Impact));
    const byImpact = IMPACT_ORDER.filter((impact) => impacts.has(impact)).map((impact) => ({
      key: impact,
      label: IMPACT_LABEL[impact],
      count: impacts.get(impact) ?? 0,
    }));
    const paths = new Map(findings.map((finding) => [finding.page.id, finding.page.path]));
    const byPage = [...count(findings.map((finding) => finding.page.id))].map(([key, value]) => ({
      key,
      label: paths.get(key) ?? key,
      count: value,
    }));
    return {
      byCriterion,
      byImpact,
      byPage,
      withoutCriterion: findings.filter((finding) => finding.rgaaCriteria.length === 0).length,
    };
  }

  /** Defects that appeared or disappeared since the previous scan of the site. */
  async comparison(organizationId: string, scanId: string) {
    const scan = await this.find(organizationId, scanId);
    const previous = await this.prisma.scan.findFirst({
      where: {
        organizationId,
        siteId: scan.siteId,
        status: { in: ['COMPLETED', 'PARTIAL'] },
        createdAt: { lt: scan.createdAt },
      },
      orderBy: { createdAt: 'desc' },
    });
    const load = (id: string) =>
      this.prisma.scanPage.findMany({
        where: { organizationId, scanId: id },
        include: { findings: { select: { fingerprint: true, ruleId: true, selector: true } } },
      });
    if (previous === null) {
      return { previousScanId: null, added: [], fixed: [], unchanged: 0, notCompared: 0 };
    }
    const [before, after] = await Promise.all([load(previous.id), load(scan.id)]);
    const comparable = (pages: typeof before) =>
      new Set(
        pages
          .filter((page) => page.status === 'ANALYZED' && !page.truncated)
          .map((page) => page.path),
      );
    const inBoth = new Set([...comparable(before)].filter((path) => comparable(after).has(path)));
    const index = (pages: typeof before) =>
      new Map(
        pages
          .filter((page) => inBoth.has(page.path))
          .flatMap((page) =>
            page.findings.map(
              (finding) => [finding.fingerprint, { ...finding, pagePath: page.path }] as const,
            ),
          ),
      );
    const was = index(before);
    const is = index(after);
    const describe = ({
      ruleId,
      pagePath,
      selector,
    }: {
      ruleId: string;
      pagePath: string;
      selector: string;
    }) => ({
      ruleId,
      pagePath,
      selector,
    });
    const total = (pages: typeof before) =>
      pages.reduce((sum, page) => sum + page.findings.length, 0);
    return {
      previousScanId: previous.id,
      added: [...is]
        .filter(([fingerprint]) => !was.has(fingerprint))
        .map(([, finding]) => describe(finding)),
      fixed: [...was]
        .filter(([fingerprint]) => !is.has(fingerprint))
        .map(([, finding]) => describe(finding)),
      unchanged: [...is.keys()].filter((fingerprint) => was.has(fingerprint)).length,
      notCompared: total(before) - was.size + (total(after) - is.size),
    };
  }

  private async find(organizationId: string, scanId: string): Promise<StoredScan> {
    const scan = await this.prisma.scan.findFirst({ where: { id: scanId, organizationId } });
    if (scan === null) {
      throw new NotFoundException('Scan introuvable');
    }
    return scan;
  }
}

function toScan(scan: StoredScan): Scan {
  return {
    id: scan.id,
    siteId: scan.siteId,
    status: scan.status,
    reason: scan.reason,
    trigger: scan.trigger,
    createdAt: scan.createdAt.toISOString(),
    startedAt: scan.startedAt?.toISOString() ?? null,
    finishedAt: scan.finishedAt?.toISOString() ?? null,
    pageCount: scan.pageCount,
    checks:
      scan.checksPassed === null || scan.checksFailed === null || scan.checksIncomplete === null
        ? null
        : {
            passed: scan.checksPassed,
            failed: scan.checksFailed,
            incomplete: scan.checksIncomplete,
          },
    score: scan.score,
    criteriaToCheckManually: criteriaToCheckManually(),
    findingsAdded: scan.findingsAdded,
    findingsFixed: scan.findingsFixed,
    referentialVersion: scan.referentialVersion,
    axeVersion: scan.axeVersion,
  };
}

function toFinding(finding: StoredFinding, pagePath: string): Finding {
  return {
    id: finding.id,
    pageId: finding.pageId,
    pagePath,
    ruleId: finding.ruleId,
    impact: finding.impact as Impact | null,
    selector: finding.selector,
    html: finding.html,
    wcag: finding.wcag,
    rgaa: {
      criteria: finding.rgaaCriteria,
      uncertain: finding.rgaaUncertain,
      candidates:
        finding.rgaaCriteria.length === 0 ? [...rgaaLinksOf(finding.ruleId).candidates] : [],
    },
    isNew: finding.isNew,
  };
}
