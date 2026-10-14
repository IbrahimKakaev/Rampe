import { Injectable, Logger } from '@nestjs/common';
import {
  automaticScore,
  checksOfPages,
  compareScans,
  CURRENT_REFERENTIAL,
  fingerprintsOfPage,
  rgaaLinksOf,
} from '@rampe/rules';
import type { PageResult, ScanEvent } from '@rampe/shared';

import type { ScanStatus } from '../generated/prisma/client.js';
import { Prisma } from '../infra/prisma.js';

const STATUS: Readonly<Record<'completed' | 'partial' | 'failed', ScanStatus>> = {
  completed: 'COMPLETED',
  partial: 'PARTIAL',
  failed: 'FAILED',
};

/** Thrown when an event arrives before the ones it depends on: the queue retries it later. */
export class NotYetError extends Error {
  override readonly name = 'NotYetError';
}

/**
 * Records what the worker reports about a scan. The worker sends raw facts;
 * everything that interprets them (RGAA criteria, fingerprints, score,
 * comparison with the previous scan) happens here, with packages/rules.
 * Every event can be delivered twice without harm.
 */
@Injectable()
export class ScanRecorder {
  private readonly logger = new Logger(ScanRecorder.name);

  constructor(private readonly prisma: Prisma) {}

  async record(event: ScanEvent): Promise<void> {
    // The organisation comes from the database, never from the message.
    const scan = await this.prisma.scan.findUnique({ where: { id: event.scanId } });
    if (scan === null) {
      this.logger.warn(`Event ${event.type} for an unknown scan, ignored`);
      return;
    }
    switch (event.type) {
      case 'started':
        await this.prisma.scan.updateMany({
          where: { id: scan.id, status: 'QUEUED' },
          data: { status: 'RUNNING', startedAt: new Date(event.at) },
        });
        return;
      case 'page':
        await this.recordPage(scan, event.position, event.page);
        return;
      case 'finished':
        await this.finish(scan, event);
        return;
      case 'crashed':
        this.logger.error(`Scan ${scan.id} crashed: ${event.message}`);
        await this.prisma.scan.update({
          where: { id: scan.id },
          data: { status: 'FAILED', reason: 'engine-error', finishedAt: new Date() },
        });
        return;
    }
  }

  private async recordPage(
    scan: { id: string; organizationId: string },
    position: number,
    page: PageResult,
  ): Promise<void> {
    const existing = await this.prisma.scanPage.findUnique({
      where: { scanId_position: { scanId: scan.id, position } },
    });
    if (existing !== null) {
      return;
    }
    const url = new URL(page.url);
    const nodes =
      page.status === 'analyzed'
        ? page.violations.flatMap((violation) =>
            violation.nodes.map((node) => ({ violation, node })),
          )
        : [];
    const fingerprints = fingerprintsOfPage(
      page.url,
      nodes.map(({ violation, node }) => ({ ruleId: violation.ruleId, selector: node.selector })),
    );
    await this.prisma.$transaction(async (tx) => {
      const stored = await tx.scanPage.create({
        data: {
          organizationId: scan.organizationId,
          scanId: scan.id,
          position,
          url: page.url,
          path: url.pathname,
          depth: page.depth,
          status: page.status === 'analyzed' ? 'ANALYZED' : 'FAILED',
          error: page.status === 'failed' ? page.error : null,
          httpStatus: page.httpStatus,
          title: page.status === 'analyzed' ? page.title : null,
          passedRules: page.status === 'analyzed' ? page.passed : [],
          incompleteRules: page.status === 'analyzed' ? page.incomplete : [],
          truncated: page.status === 'analyzed' && page.truncated,
        },
      });
      if (nodes.length > 0) {
        await tx.finding.createMany({
          data: nodes.map(({ violation, node }, index) => {
            const { links } = rgaaLinksOf(violation.ruleId);
            return {
              organizationId: scan.organizationId,
              scanId: scan.id,
              pageId: stored.id,
              ruleId: violation.ruleId,
              impact: violation.impact,
              selector: node.selector,
              html: node.html,
              wcag: violation.wcag,
              rgaaCriteria: links
                .filter((link) => link.status === 'confirmed')
                .map((link) => link.criterion),
              rgaaUncertain: links
                .filter((link) => link.status === 'uncertain')
                .map((link) => link.criterion),
              fingerprint: fingerprints[index] ?? '',
            };
          }),
        });
      }
    });
  }

  private async finish(
    scan: {
      id: string;
      organizationId: string;
      siteId: string;
      createdAt: Date;
      finishedAt: Date | null;
    },
    event: Extract<ScanEvent, { type: 'finished' }>,
  ): Promise<void> {
    if (scan.finishedAt !== null) {
      return;
    }
    const pages = await this.prisma.scanPage.findMany({
      where: { scanId: scan.id },
      include: { findings: { select: { ruleId: true, fingerprint: true } } },
    });
    if (pages.length < event.pageCount) {
      throw new NotYetError(`${String(pages.length)} of ${String(event.pageCount)} pages recorded`);
    }
    const analyzed = pages.filter((page) => page.status === 'ANALYZED');
    const checks = checksOfPages(
      analyzed.map((page) => ({
        passed: page.passedRules,
        incomplete: page.incompleteRules,
        violations: page.findings.map((finding) => ({ ruleId: finding.ruleId })),
      })),
    );

    const previous = await this.prisma.scan.findFirst({
      where: {
        siteId: scan.siteId,
        status: { in: ['COMPLETED', 'PARTIAL'] },
        createdAt: { lt: scan.createdAt },
      },
      orderBy: { createdAt: 'desc' },
      include: { pages: { include: { findings: { select: { fingerprint: true } } } } },
    });
    const snapshot = (scanPages: typeof pages | NonNullable<typeof previous>['pages']) => ({
      comparablePages: scanPages
        .filter((page) => page.status === 'ANALYZED' && !page.truncated)
        .map((page) => page.path),
      findings: scanPages.flatMap((page) =>
        page.findings.map((finding) => ({ fingerprint: finding.fingerprint, pagePath: page.path })),
      ),
    });
    const comparison =
      previous === null ? null : compareScans(snapshot(previous.pages), snapshot(pages));

    await this.prisma.$transaction([
      ...(comparison === null || comparison.added.length === 0
        ? []
        : [
            this.prisma.finding.updateMany({
              where: { scanId: scan.id, fingerprint: { in: [...comparison.added] } },
              data: { isNew: true },
            }),
          ]),
      this.prisma.scan.update({
        where: { id: scan.id },
        data: {
          status: STATUS[event.report.status],
          reason: event.report.reason,
          startedAt: new Date(event.report.startedAt),
          finishedAt: new Date(event.report.finishedAt),
          axeVersion: event.report.engine.axeVersion,
          referentialVersion: CURRENT_REFERENTIAL.version,
          pageCount: pages.length,
          checksPassed: checks.passed,
          checksFailed: checks.failed,
          checksIncomplete: checks.incomplete,
          score: automaticScore(checks),
          findingsAdded: comparison?.added.length ?? null,
          findingsFixed: comparison?.fixed.length ?? null,
          skippedByRobots: event.report.skipped.disallowedByRobots,
          skippedBeyondLimits: event.report.skipped.beyondLimits,
        },
      }),
    ]);
  }
}
