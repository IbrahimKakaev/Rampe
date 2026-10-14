/**
 * Outcome of the automated checks of a scan. One check is one automated rule
 * applied to one page where the rule is applicable. Checks the engine could not
 * decide ("incomplete") are counted elsewhere: they are neither passed nor failed.
 */
export interface CheckCounts {
  readonly passed: number;
  readonly failed: number;
}

/**
 * Automated pre-audit score: the share of automated checks that passed, between
 * 0 and 1. Returns `null` when no check could be decided, because a score of 0
 * or 1 would then be a claim the scan cannot support.
 *
 * This is never an RGAA conformity rate: automated checks cover only part of
 * the criteria.
 */
export function automaticScore({ passed, failed }: CheckCounts): number | null {
  assertCount('passed', passed);
  assertCount('failed', failed);
  const total = passed + failed;
  return total === 0 ? null : passed / total;
}

function assertCount(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, received ${String(value)}`);
  }
}
