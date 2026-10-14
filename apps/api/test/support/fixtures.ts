import type { PageResult } from '@rampe/shared';
import { SCAN_DEFAULTS } from '@rampe/shared';

import { ScanRecorder } from '../../src/scans/scan-recorder.js';
import type { Client, Harness } from './harness.js';

export const analyzedPage = (
  url: string,
  violations: { ruleId: string; selector: string }[] = [],
): PageResult => ({
  status: 'analyzed',
  url,
  depth: url.endsWith('/') ? 0 : 1,
  httpStatus: 200,
  title: url,
  passed: ['document-title', 'html-has-lang'],
  incomplete: [],
  violations: violations.map(({ ruleId, selector }) => ({
    ruleId,
    impact: 'critical',
    wcag: ['1.1.1'],
    nodes: [{ selector, html: '<img src="logo.png">' }],
  })),
  truncated: false,
});

/** Plays the worker's part: reports a finished scan made of these pages. */
export async function reportScan(
  harness: Harness,
  scanId: string,
  pages: PageResult[],
  status: 'completed' | 'partial' = 'completed',
) {
  const recorder = harness.app.get(ScanRecorder);
  await recorder.record({ type: 'started', scanId, at: '2026-10-14T08:00:00.000Z' });
  for (const [position, page] of pages.entries()) {
    await recorder.record({ type: 'page', scanId, position, page });
  }
  await recorder.record({
    type: 'finished',
    scanId,
    pageCount: pages.length,
    report: {
      target: 'https://www.example.fr/',
      status,
      reason: null,
      startedAt: '2026-10-14T08:00:00.000Z',
      finishedAt: '2026-10-14T08:00:30.000Z',
      engine: { axeVersion: '4.13.0', userAgent: 'RampeBot' },
      limits: SCAN_DEFAULTS,
      skipped: { disallowedByRobots: 0, beyondLimits: 0 },
    },
  });
}

/** Adds a site, proves its ownership by DNS, and returns its id. */
export async function verifiedSite(
  harness: Harness,
  client: Client,
  organizationId: string,
  url: string,
): Promise<string> {
  const site = (await client.post(`/orgs/${organizationId}/sites`, { url }).expect(201)).body as {
    id: string;
  };
  const instructions = (
    await client.get(`/orgs/${organizationId}/sites/${site.id}/verification`).expect(200)
  ).body as {
    dns: { name: string; value: string };
  };
  harness.dns.records.set(instructions.dns.name, [instructions.dns.value]);
  await client
    .post(`/orgs/${organizationId}/sites/${site.id}/verification/check`, { method: 'DNS' })
    .expect(200);
  return site.id;
}
