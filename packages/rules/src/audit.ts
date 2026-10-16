/**
 * What the automated results propose for the manual audit grid, criterion by
 * criterion, on a page of the sample (PLAN.md, §4.2):
 *
 * | Situation                                               | Proposal                       |
 * | ------------------------------------------------------- | ------------------------------ |
 * | Defect found, link to the criterion confirmed            | "non conforme"                 |
 * | Defect found, link uncertain                             | none: a clue for the auditor   |
 * | No defect, criterion entirely automatable                | "conforme", to be confirmed    |
 * | No defect, criterion partially automatable or manual     | none: the auditor decides      |
 *
 * A "non conforme" proposal is a status: a defect was found. The auditor may
 * overturn it, with a note (a false positive). A "conforme" proposal is never
 * a status on its own: an automated test never proves conformity, so it only
 * counts once the auditor has confirmed it.
 */
import type { CriterionClassification } from './rgaa/classification.js';
import { CLASSIFICATION } from './rgaa/classification.js';

/** What the scan found on one page. */
export interface PageEvidence {
  /** False when the scan could not analyse the page, or the page was not scanned: nothing is proposed. */
  readonly analyzed: boolean;
  /** Rules that ran on the page and found nothing wrong. */
  readonly passedRules: readonly string[];
  readonly findings: readonly {
    readonly ruleId: string;
    /** Criteria linked with certainty. */
    readonly criteria: readonly string[];
    /** Criteria linked with doubt. */
    readonly uncertain: readonly string[];
  }[];
}

export type Proposal =
  /** A defect breaks the criterion: proposed as "non conforme", which counts until overturned. */
  | { readonly kind: 'non-compliant'; readonly rules: readonly string[] }
  /** The automated rules all passed: "conforme" proposed, which counts only once confirmed. */
  | { readonly kind: 'compliant-to-confirm'; readonly rules: readonly string[] }
  /** A defect may concern the criterion: a clue, never a status. */
  | { readonly kind: 'clue'; readonly rules: readonly string[] };

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/** The proposal for one criterion on one page, or null when the auditor decides alone. */
export function proposeFor(
  classification: CriterionClassification,
  page: PageEvidence,
): Proposal | null {
  if (!page.analyzed) {
    return null;
  }
  const { criterion } = classification;
  const breaking = page.findings.filter((finding) => finding.criteria.includes(criterion));
  if (breaking.length > 0) {
    return { kind: 'non-compliant', rules: unique(breaking.map(({ ruleId }) => ruleId)) };
  }
  const doubtful = page.findings.filter((finding) => finding.uncertain.includes(criterion));
  if (doubtful.length > 0) {
    return { kind: 'clue', rules: unique(doubtful.map(({ ruleId }) => ruleId)) };
  }
  if (
    classification.automation === 'automatable' &&
    classification.rules.every((rule) => page.passedRules.includes(rule))
  ) {
    return { kind: 'compliant-to-confirm', rules: [...classification.rules] };
  }
  return null;
}

/** The proposals for every criterion of the referential on one page, criteria without one left out. */
export function proposalsForPage(
  page: PageEvidence,
  classification: readonly CriterionClassification[] = CLASSIFICATION,
): ReadonlyMap<string, Proposal> {
  const proposals = new Map<string, Proposal>();
  for (const entry of classification) {
    const proposal = proposeFor(entry, page);
    if (proposal !== null) {
      proposals.set(entry.criterion, proposal);
    }
  }
  return proposals;
}
