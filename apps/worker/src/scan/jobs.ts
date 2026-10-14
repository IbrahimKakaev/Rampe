import {
  type ScanEvent,
  scanJobSchema,
  type ScanReport,
  type ScanLimits,
  type SiteCheckResult,
  siteCheckJobSchema,
} from '@rampe/shared';

import type { TextFetcher } from './http-fetcher.js';
import type { NavigationGate } from './politeness.js';

/** The largest ownership proof file worth reading. */
const PROOF_MAX_BYTES = 4096;

export type EmitEvent = (event: ScanEvent, id: string) => Promise<void>;

/**
 * Runs a scan job and publishes what it finds, one page per message, then a
 * closing message. Message ids derive from the scan id, so that a message sent
 * twice is recorded once. A crash is reported too: the scan never stays
 * "running" for ever.
 */
export function createScanJobHandler(deps: {
  readonly runScan: (request: { url: string; limits: ScanLimits }) => Promise<ScanReport>;
  readonly emit: EmitEvent;
  readonly now?: () => Date;
}): (data: unknown) => Promise<void> {
  const now = deps.now ?? (() => new Date());
  return async (data) => {
    const job = scanJobSchema.parse(data);
    const { scanId } = job;
    await deps.emit({ type: 'started', scanId, at: now().toISOString() }, `${scanId}-started`);
    let report: ScanReport;
    try {
      report = await deps.runScan({ url: job.url, limits: job.limits });
    } catch (error) {
      await deps.emit(
        {
          type: 'crashed',
          scanId,
          message: error instanceof Error ? error.message : String(error),
        },
        `${scanId}-crashed`,
      );
      return;
    }
    const { pages, ...rest } = report;
    for (const [position, page] of pages.entries()) {
      await deps.emit(
        { type: 'page', scanId, position, page },
        `${scanId}-page-${String(position)}`,
      );
    }
    await deps.emit(
      { type: 'finished', scanId, pageCount: pages.length, report: rest },
      `${scanId}-finished`,
    );
  };
}

/** Fetches an ownership proof file through the egress proxy, for the API. */
export function createSiteCheckHandler(deps: {
  readonly fetchText: TextFetcher;
  readonly gate: NavigationGate;
  readonly intervalMs: number;
}): (data: unknown) => Promise<SiteCheckResult> {
  return async (data) => {
    const { url } = siteCheckJobSchema.parse(data);
    await deps.gate.wait(new URL(url).host, deps.intervalMs, AbortSignal.timeout(20_000));
    const answer = await deps.fetchText(url, PROOF_MAX_BYTES);
    return answer === null
      ? { status: null, body: null }
      : { status: answer.status, body: answer.body };
  };
}
