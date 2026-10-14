const CRITERION_TAG = /^wcag\d\d\d{1,2}$/;

/**
 * Reads the WCAG success criteria out of the tags of an axe-core rule.
 *
 * axe-core writes a success criterion as "wcag" followed by its digits without
 * dots: "wcag111" is 1.1.1 and "wcag1412" is 1.4.12. The other tags that start
 * with "wcag" are conformance levels ("wcag2a", "wcag21aa") and are ignored.
 * The result is sorted in the WCAG order and has no duplicates.
 */
export function wcagCriteriaFromTags(tags: readonly string[]): string[] {
  const criteria = new Map<string, number>();
  for (const tag of tags) {
    if (CRITERION_TAG.test(tag)) {
      const digits = tag.slice('wcag'.length);
      const principle = digits.charAt(0);
      const guideline = digits.charAt(1);
      const criterion = digits.slice(2);
      const order = Number(principle) * 10_000 + Number(guideline) * 100 + Number(criterion);
      criteria.set(`${principle}.${guideline}.${criterion}`, order);
    }
  }
  return [...criteria.entries()].sort(([, a], [, b]) => a - b).map(([criterion]) => criterion);
}
