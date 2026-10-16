import * as z from 'zod/mini';

import { impactSchema, pageErrorSchema } from '../scan.js';
import { idSchema, isoDateSchema } from './common.js';
import { scanStateSchema } from './sites.js';

export const scanSchema = z.strictObject({
  id: idSchema,
  siteId: idSchema,
  status: scanStateSchema,
  reason: z.nullable(z.string()),
  trigger: z.enum(['MANUAL', 'SCHEDULED']),
  createdAt: isoDateSchema,
  startedAt: z.nullable(isoDateSchema),
  finishedAt: z.nullable(isoDateSchema),
  pageCount: z.nullable(z.number()),
  checks: z.nullable(
    z.strictObject({ passed: z.number(), failed: z.number(), incomplete: z.number() }),
  ),
  /** Automated pre-audit score, between 0 and 1. Never an RGAA conformity rate. */
  score: z.nullable(z.number()),
  /** Criteria the automated pre-audit cannot decide: always shown next to the score. */
  criteriaToCheckManually: z.number(),
  findingsAdded: z.nullable(z.number()),
  findingsFixed: z.nullable(z.number()),
  referentialVersion: z.string(),
  axeVersion: z.nullable(z.string()),
});
export type Scan = z.infer<typeof scanSchema>;

export const scanPageSchema = z.strictObject({
  id: idSchema,
  position: z.number(),
  url: z.string(),
  path: z.string(),
  depth: z.number(),
  status: z.enum(['ANALYZED', 'FAILED']),
  error: z.nullable(pageErrorSchema),
  httpStatus: z.nullable(z.number()),
  title: z.nullable(z.string()),
  findingCount: z.number(),
  truncated: z.boolean(),
});
export type ScanPage = z.infer<typeof scanPageSchema>;

export const rgaaAttachmentSchema = z.strictObject({
  /** Criteria linked with certainty. */
  criteria: z.array(z.string()),
  /** Criteria linked with doubt: "critère RGAA à confirmer". */
  uncertain: z.array(z.string()),
  /** When no criterion is linked: the criteria it may belong to. */
  candidates: z.array(z.string()),
});

export const findingSchema = z.strictObject({
  id: idSchema,
  pageId: idSchema,
  pagePath: z.string(),
  ruleId: z.string(),
  /** Short French description of the defect, from the corrections content; null if it has none. */
  title: z.nullable(z.string()),
  impact: z.nullable(impactSchema),
  selector: z.string(),
  html: z.string(),
  wcag: z.array(z.string()),
  rgaa: rgaaAttachmentSchema,
  isNew: z.boolean(),
});
export type Finding = z.infer<typeof findingSchema>;

export const correctionSchema = z.strictObject({
  title: z.string(),
  impact: z.string(),
  fix: z.string(),
});

export const findingDetailSchema = z.extend(findingSchema, {
  pageUrl: z.string(),
  fingerprint: z.string(),
  correction: z.nullable(correctionSchema),
  /** Official title of every RGAA criterion the defect names, certain, uncertain or candidate. */
  criterionTitles: z.record(z.string(), z.string()),
});

export const findingsQuerySchema = z.strictObject({
  ruleId: z.optional(z.string().check(z.maxLength(100))),
  /** An RGAA criterion, or "none" for the defects attached to no criterion with certainty. */
  criterion: z.optional(
    z.union([z.string().check(z.regex(/^\d{1,2}\.\d{1,2}$/)), z.literal('none')]),
  ),
  impact: z.optional(impactSchema),
  pageId: z.optional(idSchema),
  limit: z.optional(z.coerce.number().check(z.multipleOf(1), z.gte(1), z.lte(500))),
  offset: z.optional(z.coerce.number().check(z.multipleOf(1), z.gte(0))),
});

export const findingsPageSchema = z.strictObject({
  total: z.number(),
  items: z.array(findingSchema),
});

export const findingGroupSchema = z.strictObject({
  key: z.string(),
  /** Readable name of the group: criterion title, impact, page path. */
  label: z.string(),
  count: z.number(),
});

export const findingsSummarySchema = z.strictObject({
  byCriterion: z.array(findingGroupSchema),
  byImpact: z.array(findingGroupSchema),
  byPage: z.array(findingGroupSchema),
  /** Defects whose rule has no criterion, or only uncertain ones. */
  withoutCriterion: z.number(),
});

const comparedFindingSchema = z.strictObject({
  ruleId: z.string(),
  /** Short French description of the defect, from the corrections content. */
  title: z.nullable(z.string()),
  pagePath: z.string(),
  selector: z.string(),
});

export const scanComparisonSchema = z.strictObject({
  previousScanId: z.nullable(idSchema),
  added: z.array(comparedFindingSchema),
  fixed: z.array(comparedFindingSchema),
  unchanged: z.number(),
  /** Defects on pages that were not analysed in both scans. */
  notCompared: z.number(),
});
export type ScanComparison = z.infer<typeof scanComparisonSchema>;
