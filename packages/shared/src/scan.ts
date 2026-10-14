import * as z from 'zod/mini';

/** Limits of a scan, from the specification. */
export const SCAN_DEFAULTS = {
  maxPages: 25,
  maxDepth: 3,
  /** Pages analysed at the same time within one scan. */
  concurrency: 2,
  pageTimeoutMs: 30_000,
  scanTimeoutMs: 15 * 60_000,
  /**
   * Minimum delay between two navigations to the same host, across all scans.
   * The specification asks for one request per second at most; the extra tenth
   * of a second keeps the delay above one second as the server sees it, whatever
   * the network jitter.
   */
  navigationIntervalMs: 1100,
} as const;

/** Upper bounds an operator may configure, so that a scan stays polite and bounded. */
export const SCAN_MAX_PAGES_LIMIT = 200;

/** HTML extracts are cut to this many characters: enough to locate a defect, no more. */
export const HTML_SNIPPET_MAX_LENGTH = 500;

/** Beyond this many defective elements, a page's result is cut and marked as such. */
export const MAX_VIOLATION_NODES_PER_PAGE = 2000;

export const impactSchema = z.enum(['minor', 'moderate', 'serious', 'critical']);
export type Impact = z.infer<typeof impactSchema>;

export const violationNodeSchema = z.strictObject({
  /** CSS selector of the element; frames and shadow roots are separated by " | " and " >>> ". */
  selector: z.string(),
  html: z.string().check(z.maxLength(HTML_SNIPPET_MAX_LENGTH)),
});
export type ViolationNode = z.infer<typeof violationNodeSchema>;

export const violationSchema = z.strictObject({
  ruleId: z.string(),
  impact: z.nullable(impactSchema),
  /** WCAG success criteria the rule refers to, such as "1.1.1". */
  wcag: z.array(z.string()),
  nodes: z.array(violationNodeSchema),
});
export type Violation = z.infer<typeof violationSchema>;

export const pageErrorSchema = z.enum([
  /** The page did not finish loading and being analysed within the page time limit. */
  'timeout',
  /** The egress proxy refused the destination. */
  'blocked',
  /** The server answered with an HTTP error status. */
  'http-error',
  /** The response is not an HTML document. */
  'not-html',
  /** The page redirected to another host, which is outside the scan. */
  'redirected-off-site',
  /** The browser could not load the page for another reason. */
  'navigation-failed',
]);
export type PageError = z.infer<typeof pageErrorSchema>;

export const analyzedPageSchema = z.strictObject({
  status: z.literal('analyzed'),
  url: z.url(),
  depth: z.number().check(z.multipleOf(1), z.gte(0)),
  httpStatus: z.number(),
  title: z.string(),
  /** Rules that ran on the page and found nothing wrong. */
  passed: z.array(z.string()),
  /** Rules that could not decide automatically: to be checked by hand. */
  incomplete: z.array(z.string()),
  violations: z.array(violationSchema),
  /** True when the page had more defective elements than are kept. */
  truncated: z.boolean(),
});
export type AnalyzedPage = z.infer<typeof analyzedPageSchema>;

export const failedPageSchema = z.strictObject({
  status: z.literal('failed'),
  url: z.url(),
  depth: z.number().check(z.multipleOf(1), z.gte(0)),
  error: pageErrorSchema,
  httpStatus: z.nullable(z.number()),
});
export type FailedPage = z.infer<typeof failedPageSchema>;

export const pageResultSchema = z.discriminatedUnion('status', [
  analyzedPageSchema,
  failedPageSchema,
]);
export type PageResult = z.infer<typeof pageResultSchema>;

export const scanStatusSchema = z.enum([
  /** Every page within the limits was visited. */
  'completed',
  /** The scan ran out of time before visiting every page within the limits. */
  'partial',
  /** The scan could not start: the home page could not be analysed or is off limits. */
  'failed',
]);

export const scanReportSchema = z.strictObject({
  target: z.url(),
  status: scanStatusSchema,
  /** Why a failed scan failed, or why a scan stopped before the end of its frontier. */
  reason: z.nullable(
    z.enum([
      'site-unreachable',
      'disallowed-by-robots',
      'home-page-failed',
      'page-limit',
      'scan-timeout',
    ]),
  ),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime(),
  engine: z.strictObject({ axeVersion: z.nullable(z.string()), userAgent: z.string() }),
  limits: z.strictObject({
    maxPages: z.number(),
    maxDepth: z.number(),
    concurrency: z.number(),
    pageTimeoutMs: z.number(),
    scanTimeoutMs: z.number(),
    navigationIntervalMs: z.number(),
  }),
  pages: z.array(pageResultSchema),
  skipped: z.strictObject({
    /** Links of the site that robots.txt forbids. */
    disallowedByRobots: z.number(),
    /** Links found but not visited because the page or depth limit was reached. */
    beyondLimits: z.number(),
  }),
});
export type ScanReport = z.infer<typeof scanReportSchema>;
export type ScanLimits = ScanReport['limits'];
