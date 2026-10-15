import * as z from 'zod/mini';

import { idSchema, isoDateSchema } from './common.js';

export const verificationMethodSchema = z.enum(['DNS', 'FILE']);
export const scanScheduleSchema = z.enum(['NONE', 'DAILY', 'WEEKLY']);

export const createSiteRequestSchema = z.strictObject({
  /** The address of the site's home page, http or https. */
  url: z.url({ protocol: /^https?$/, error: 'Adresse de site invalide : http ou https attendu.' }),
});

export const updateSiteRequestSchema = z.strictObject({
  maxPages: z.optional(z.number().check(z.multipleOf(1), z.gte(1), z.lte(200))),
  schedule: z.optional(scanScheduleSchema),
});

export const scanStateSchema = z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED']);

export const siteSchema = z.strictObject({
  id: idSchema,
  origin: z.string(),
  host: z.string(),
  verified: z.boolean(),
  verificationMethod: z.nullable(verificationMethodSchema),
  verifiedAt: z.nullable(isoDateSchema),
  maxPages: z.number(),
  schedule: scanScheduleSchema,
  createdAt: isoDateSchema,
  lastScan: z.nullable(
    z.strictObject({
      id: idSchema,
      status: scanStateSchema,
      score: z.nullable(z.number()),
      /** Criteria the automated pre-audit cannot decide: always shown next to the score. */
      criteriaToCheckManually: z.number(),
      finishedAt: z.nullable(isoDateSchema),
    }),
  ),
  /** Score of the last finished scan minus that of the one before, or null. */
  trend: z.nullable(z.number()),
});
export type Site = z.infer<typeof siteSchema>;

export const verificationInstructionsSchema = z.strictObject({
  token: z.string(),
  dns: z.strictObject({ type: z.literal('TXT'), name: z.string(), value: z.string() }),
  file: z.strictObject({ url: z.string(), content: z.string() }),
});

export const verificationCheckRequestSchema = z.strictObject({ method: verificationMethodSchema });

export const verificationResultSchema = z.strictObject({
  verified: z.boolean(),
  method: verificationMethodSchema,
  /** What was found, in French, for the person checking. */
  detail: z.string(),
});
export type VerificationResult = z.infer<typeof verificationResultSchema>;
