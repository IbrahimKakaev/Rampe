/** Status of a criterion on a page of the audit sample, as the auditor records it. */
export type AuditStatus = 'C' | 'NC' | 'NA';

/** Conformity states of the accessibility statement. */
export type ConformityState = 'total' | 'partial' | 'none';

export interface ConformityResult {
  /** Evaluations recorded, and how many the sample calls for (criteria × pages). */
  readonly evaluated: number;
  readonly expected: number;
  readonly complete: boolean;
  /** Criteria validated, invalidated and not applicable on the whole sample. */
  readonly validated: number;
  readonly invalidated: number;
  readonly notApplicable: number;
  /**
   * Validated criteria divided by applicable criteria. `null` until every
   * criterion has a status on every page: a partial audit has no rate.
   * `null` as well when no criterion applies, which proves nothing.
   */
  readonly rate: number | null;
  /** Mean of the rates of the pages; the same conditions apply. */
  readonly averageRate: number | null;
  readonly state: ConformityState | null;
}

/**
 * Conformity rate by the official method of the RGAA
 * (accessibilite.numerique.gouv.fr/obligations/evaluation-conformite):
 * - a criterion is applicable when it applies to at least one page of the sample;
 * - it is validated when it is validated on every page where it applies;
 * - the rate is the number of validated criteria divided by the number of
 *   applicable criteria;
 * - the average rate is the mean of the rates of each page.
 *
 * The state follows the accessibility statement rules: total at 100 %,
 * partial from 50 %, none below.
 */
export function conformity(
  criteria: readonly string[],
  pages: readonly string[],
  results: Readonly<Record<string, Readonly<Record<string, AuditStatus | undefined>>>>,
): ConformityResult {
  const statusOf = (page: string, criterion: string): AuditStatus | undefined =>
    results[page]?.[criterion];
  const expected = criteria.length * pages.length;
  let evaluated = 0;
  for (const page of pages) {
    for (const criterion of criteria) {
      if (statusOf(page, criterion) !== undefined) {
        evaluated += 1;
      }
    }
  }

  let validated = 0;
  let invalidated = 0;
  for (const criterion of criteria) {
    const statuses = pages.map((page) => statusOf(page, criterion));
    if (statuses.includes('NC')) {
      invalidated += 1;
    } else if (statuses.includes('C')) {
      validated += 1;
    }
  }
  const complete = expected > 0 && evaluated === expected;
  const notApplicable = complete ? criteria.length - validated - invalidated : 0;

  const pageRates = pages.flatMap((page) => {
    const statuses = criteria.map((criterion) => statusOf(page, criterion));
    const conform = statuses.filter((status) => status === 'C').length;
    const applicable = conform + statuses.filter((status) => status === 'NC').length;
    return applicable === 0 ? [] : [conform / applicable];
  });

  const applicable = validated + invalidated;
  const rate = complete && applicable > 0 ? validated / applicable : null;
  const averageRate =
    complete && pageRates.length > 0
      ? pageRates.reduce((sum, value) => sum + value, 0) / pageRates.length
      : null;
  const state: ConformityState | null =
    rate === null ? null : rate === 1 ? 'total' : rate >= 0.5 ? 'partial' : 'none';

  return {
    evaluated,
    expected,
    complete,
    validated: complete ? validated : 0,
    invalidated: complete ? invalidated : 0,
    notApplicable,
    rate,
    averageRate,
    state,
  };
}
