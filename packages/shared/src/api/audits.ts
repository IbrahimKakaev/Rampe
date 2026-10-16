import * as z from 'zod/mini';

import { idSchema, isoDateSchema, nameSchema } from './common.js';

/** Status of a criterion on a page: conforme, non conforme, non applicable. */
export const auditStatusSchema = z.enum(['C', 'NC', 'NA']);
export type AuditStatusValue = z.infer<typeof auditStatusSchema>;

/** Who set the status: the automated results (a defect found) or the auditor. */
export const auditOriginSchema = z.enum(['AUTOMATIC', 'AUDITOR']);

/** What the automated results propose (PLAN.md, §4.2). */
export const proposalKindSchema = z.enum(['NON_COMPLIANT', 'COMPLIANT_TO_CONFIRM', 'CLUE']);

export const automationSchema = z.enum(['automatable', 'partial', 'manual']);

export const conformitySchema = z.strictObject({
  /** Evaluations recorded, and how many the sample calls for: criteria × pages. */
  evaluated: z.number(),
  expected: z.number(),
  complete: z.boolean(),
  validated: z.number(),
  invalidated: z.number(),
  notApplicable: z.number(),
  /** RGAA conformity rate, official method; null until the audit is complete. */
  rate: z.nullable(z.number()),
  /** Mean of the rates of the pages; null until the audit is complete. */
  averageRate: z.nullable(z.number()),
  state: z.nullable(z.enum(['total', 'partial', 'none'])),
});
export type Conformity = z.infer<typeof conformitySchema>;

export const createAuditRequestSchema = z.strictObject({
  /** The scan whose results feed the proposals. */
  scanId: idSchema,
});

export const auditPageSchema = z.strictObject({
  id: idSchema,
  position: z.number(),
  url: z.string(),
  title: z.string(),
  /** False when the page is not in the reference scan: nothing is proposed for it. */
  scanned: z.boolean(),
  evaluated: z.number(),
  expected: z.number(),
});
export type AuditPage = z.infer<typeof auditPageSchema>;

export const auditSchema = z.strictObject({
  id: idSchema,
  siteId: idSchema,
  scanId: z.nullable(idSchema),
  referentialVersion: z.string(),
  createdAt: isoDateSchema,
  pages: z.array(auditPageSchema),
  conformity: conformitySchema,
});
export type Audit = z.infer<typeof auditSchema>;

export const auditSummarySchema = z.strictObject({
  id: idSchema,
  createdAt: isoDateSchema,
  pageCount: z.number(),
  conformity: conformitySchema,
});
export type AuditSummary = z.infer<typeof auditSummarySchema>;

const pageUrlSchema = z.url({
  protocol: /^https?$/,
  error: 'Adresse de page invalide : http ou https attendu.',
});

/** The sample, in its order. A page kept from the previous sample keeps its evaluations. */
export const auditSampleRequestSchema = z.strictObject({
  pages: z
    .array(z.strictObject({ url: pageUrlSchema, title: nameSchema }))
    .check(z.minLength(1), z.maxLength(50)),
});
export type AuditSampleRequest = z.infer<typeof auditSampleRequestSchema>;

export const criterionEvaluationSchema = z.strictObject({
  criterion: z.string(),
  theme: z.number(),
  themeTitle: z.string(),
  title: z.string(),
  automation: automationSchema,
  status: z.nullable(auditStatusSchema),
  origin: z.nullable(auditOriginSchema),
  note: z.nullable(z.string()),
  proposal: z.nullable(proposalKindSchema),
  /** The automated rules behind the proposal, named in French when the content has a name. */
  proposalRules: z.array(z.strictObject({ ruleId: z.string(), title: z.nullable(z.string()) })),
  author: z.nullable(z.string()),
  updatedAt: z.nullable(isoDateSchema),
});
export type CriterionEvaluation = z.infer<typeof criterionEvaluationSchema>;

export const evaluationRequestSchema = z.strictObject({
  /** null clears the evaluation. */
  status: z.nullable(auditStatusSchema),
  note: z.nullable(z.string().check(z.trim(), z.maxLength(2000))),
});
export type EvaluationRequest = z.infer<typeof evaluationRequestSchema>;

const optionalUrl = z.union([z.literal(''), z.url({ protocol: /^https?$/ })]);
const text = (max: number) => z.string().check(z.trim(), z.maxLength(max));

/** What the person writes in the statement; the audit gives the rest. */
export const statementFieldsSchema = z.strictObject({
  /** The organisation responsible for the service. */
  entityName: text(200),
  /** The site, as the statement names it. */
  serviceName: text(200),
  /** "en interne" or the name of the auditing company. */
  auditedBy: text(200),
  derogations: text(5000),
  exemptions: text(5000),
  technologies: text(1000),
  testEnvironment: text(2000),
  tools: text(1000),
  contactFormUrl: optionalUrl,
  contactDetails: text(1000),
  multiYearPlanUrl: optionalUrl,
  actionPlanUrl: optionalUrl,
});
export type StatementFields = z.infer<typeof statementFieldsSchema>;

/** One block of the generated statement: a paragraph or a list, links included. */
export const statementBlockSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('paragraph'), text: z.string() }),
  z.strictObject({
    type: z.literal('list'),
    items: z.array(z.strictObject({ text: z.string(), href: z.nullable(z.string()) })),
  }),
]);

export const statementSchema = z.strictObject({
  fields: statementFieldsSchema,
  /** True while the audit is not complete: the statement is only a draft. */
  draft: z.boolean(),
  title: z.string(),
  /** The opening commitment, without a heading in the official model. */
  intro: z.array(statementBlockSchema),
  sections: z.array(
    z.strictObject({
      heading: z.string(),
      level: z.union([z.literal(2), z.literal(3)]),
      blocks: z.array(statementBlockSchema),
    }),
  ),
});
export type Statement = z.infer<typeof statementSchema>;

/** The referential and the classification of its criteria, public. */
export const referentialSchema = z.strictObject({
  version: z.string(),
  themes: z.array(z.strictObject({ number: z.number(), title: z.string() })),
  criteria: z.array(
    z.strictObject({
      id: z.string(),
      theme: z.number(),
      title: z.string(),
      automation: automationSchema,
    }),
  ),
  criteriaToCheckManually: z.number(),
});
