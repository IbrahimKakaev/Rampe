import type { CheckCounts } from './score.js';

/** What the scan recorded of one analysed page: the identifiers of the rules, by outcome. */
export interface PageChecks {
  readonly passed: readonly string[];
  readonly incomplete: readonly string[];
  readonly violations: readonly { readonly ruleId: string }[];
}

export interface CheckOutcome extends CheckCounts {
  /** Rules that could not decide on the page: to be checked by hand. */
  readonly incomplete: number;
}

/**
 * Counts the checks of a page: one check is one rule on one page. axe-core
 * may list a rule under several outcomes when its elements differ; the most
 * severe wins. A defect on one element fails the check, and an element the
 * rule could not judge keeps it from passing.
 */
export function checksOfPage(page: PageChecks): CheckOutcome {
  const failed = new Set(page.violations.map((violation) => violation.ruleId));
  const incomplete = new Set(page.incomplete.filter((rule) => !failed.has(rule)));
  const passed = new Set(page.passed.filter((rule) => !failed.has(rule) && !incomplete.has(rule)));
  return { passed: passed.size, failed: failed.size, incomplete: incomplete.size };
}

export function checksOfPages(pages: readonly PageChecks[]): CheckOutcome {
  return pages.map(checksOfPage).reduce(
    (total, page) => ({
      passed: total.passed + page.passed,
      failed: total.failed + page.failed,
      incomplete: total.incomplete + page.incomplete,
    }),
    { passed: 0, failed: 0, incomplete: 0 },
  );
}
