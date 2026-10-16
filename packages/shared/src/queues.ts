import * as z from 'zod/mini';

import { pageResultSchema, scanReportSchema } from './scan.js';

/** Queue used for liveness checks between the API and the worker. */
export const SYSTEM_QUEUE = 'system';
export const PING_JOB = 'ping';

export const pingResultSchema = z.strictObject({
  pong: z.literal(true),
  /** ISO 8601 timestamp taken by the worker when it handled the job. */
  handledAt: z.iso.datetime(),
});
export type PingResult = z.infer<typeof pingResultSchema>;

/** API → worker: scans to run. The job id is the scan id. */
export const SCANS_QUEUE = 'scans';

export const scanJobSchema = z.strictObject({
  scanId: z.uuid(),
  url: z.url(),
  limits: scanReportSchema.shape.limits,
});
export type ScanJob = z.infer<typeof scanJobSchema>;

/**
 * Worker → API: what a scan produces, one message at a time, so that a large
 * site never makes one large message. The API persists them; "finished" waits
 * until every page has been persisted.
 */
export const SCAN_EVENTS_QUEUE = 'scan-events';

export const scanEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('started'), scanId: z.uuid(), at: z.iso.datetime() }),
  z.strictObject({
    type: z.literal('page'),
    scanId: z.uuid(),
    /** Order of the page in the scan, from 0. */
    position: z.number().check(z.multipleOf(1), z.gte(0)),
    page: pageResultSchema,
  }),
  z.strictObject({
    type: z.literal('finished'),
    scanId: z.uuid(),
    pageCount: z.number().check(z.multipleOf(1), z.gte(0)),
    report: z.omit(scanReportSchema, { pages: true }),
  }),
  z.strictObject({
    type: z.literal('crashed'),
    scanId: z.uuid(),
    /** What went wrong, for the operator; never shown to the customer as is. */
    message: z.string(),
  }),
]);
export type ScanEvent = z.infer<typeof scanEventSchema>;

/**
 * API → worker: fetch the ownership proof file of a site through the egress
 * proxy. The API never connects to a customer's site itself.
 */
export const SITE_CHECKS_QUEUE = 'site-checks';

export const siteCheckJobSchema = z.strictObject({ url: z.url() });
export type SiteCheckJob = z.infer<typeof siteCheckJobSchema>;

export const siteCheckResultSchema = z.strictObject({
  /** null when nothing answered, or the proxy refused the address. */
  status: z.nullable(z.number()),
  /** The first kilobytes of the body. */
  body: z.nullable(z.string()),
});
export type SiteCheckResult = z.infer<typeof siteCheckResultSchema>;

/**
 * API → worker: turn the HTML of a report into a PDF. The worker renders it in
 * the isolated browser, JavaScript off and every network request refused.
 */
export const REPORTS_QUEUE = 'reports';

export const reportJobSchema = z.strictObject({ html: z.string() });
export type ReportJob = z.infer<typeof reportJobSchema>;

export const reportResultSchema = z.strictObject({
  /** The PDF, base64-encoded: a job result travels as JSON. */
  pdf: z.string(),
});
export type ReportResult = z.infer<typeof reportResultSchema>;
