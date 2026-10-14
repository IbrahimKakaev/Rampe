import { describe, expect, it } from '@jest/globals';

import {
  HTML_SNIPPET_MAX_LENGTH,
  pageResultSchema,
  SCAN_DEFAULTS,
  scanReportSchema,
  type ScanReport,
} from './scan.js';

const report: ScanReport = {
  target: 'https://www.example.fr/',
  status: 'completed',
  reason: null,
  startedAt: '2026-10-14T08:00:00.000Z',
  finishedAt: '2026-10-14T08:00:30.000Z',
  engine: { axeVersion: '4.13.0', userAgent: 'Mozilla/5.0 (compatible; RampeBot/1.0)' },
  limits: { ...SCAN_DEFAULTS },
  pages: [
    {
      status: 'analyzed',
      url: 'https://www.example.fr/',
      depth: 0,
      httpStatus: 200,
      title: 'Accueil',
      passed: ['document-title'],
      incomplete: ['color-contrast'],
      violations: [
        {
          ruleId: 'image-alt',
          impact: 'critical',
          wcag: ['1.1.1'],
          nodes: [{ selector: 'img.logo', html: '<img class="logo" src="logo.png">' }],
        },
      ],
      truncated: false,
    },
    {
      status: 'failed',
      url: 'https://www.example.fr/lent',
      depth: 1,
      error: 'timeout',
      httpStatus: null,
    },
  ],
  skipped: { disallowedByRobots: 1, beyondLimits: 0 },
};

describe('scan schemas', () => {
  it('keep the limits of the specification', () => {
    expect(SCAN_DEFAULTS).toMatchObject({
      maxPages: 25,
      maxDepth: 3,
      concurrency: 2,
      pageTimeoutMs: 30_000,
      scanTimeoutMs: 900_000,
    });
    expect(SCAN_DEFAULTS.navigationIntervalMs).toBeGreaterThanOrEqual(1000);
  });

  it('accept a complete report', () => {
    expect(scanReportSchema.parse(report)).toEqual(report);
  });

  it('refuse an HTML extract longer than the limit', () => {
    const page = report.pages[0];
    if (page?.status !== 'analyzed') {
      throw new Error('fixture');
    }
    const long = {
      ...page,
      violations: [
        {
          ruleId: 'x',
          impact: null,
          wcag: [],
          nodes: [{ selector: 'p', html: 'a'.repeat(HTML_SNIPPET_MAX_LENGTH + 1) }],
        },
      ],
    };
    expect(pageResultSchema.safeParse(long).success).toBe(false);
  });

  it('refuse a page result that mixes both shapes', () => {
    expect(pageResultSchema.safeParse({ ...report.pages[1], status: 'analyzed' }).success).toBe(
      false,
    );
  });
});
