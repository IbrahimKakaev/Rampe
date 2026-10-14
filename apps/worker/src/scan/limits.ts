import { SCAN_DEFAULTS, SCAN_MAX_PAGES_LIMIT, type ScanLimits } from '@rampe/shared';

export class InvalidLimitError extends Error {
  override readonly name = 'InvalidLimitError';
}

export interface LimitOptions {
  readonly maxPages?: string | undefined;
  readonly maxDepth?: string | undefined;
  readonly pageTimeoutMs?: string | undefined;
  readonly scanTimeoutMs?: string | undefined;
}

function integerWithin(
  name: string,
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined) {
    return fallback;
  }
  const number = Number(value);
  if (!/^\d+$/.test(value) || number < min || number > max) {
    throw new InvalidLimitError(
      `${name} must be an integer between ${String(min)} and ${String(max)}`,
    );
  }
  return number;
}

/**
 * Limits of a scan, from the defaults of the specification. A caller may
 * tighten them, never loosen them, except for the page count, which may go up
 * to a fixed ceiling.
 */
export function limitsFromOptions(options: LimitOptions): ScanLimits {
  return {
    ...SCAN_DEFAULTS,
    maxPages: integerWithin(
      'max-pages',
      options.maxPages,
      SCAN_DEFAULTS.maxPages,
      1,
      SCAN_MAX_PAGES_LIMIT,
    ),
    maxDepth: integerWithin(
      'max-depth',
      options.maxDepth,
      SCAN_DEFAULTS.maxDepth,
      0,
      SCAN_DEFAULTS.maxDepth,
    ),
    pageTimeoutMs: integerWithin(
      'page-timeout-ms',
      options.pageTimeoutMs,
      SCAN_DEFAULTS.pageTimeoutMs,
      1000,
      SCAN_DEFAULTS.pageTimeoutMs,
    ),
    scanTimeoutMs: integerWithin(
      'scan-timeout-ms',
      options.scanTimeoutMs,
      SCAN_DEFAULTS.scanTimeoutMs,
      1000,
      SCAN_DEFAULTS.scanTimeoutMs,
    ),
  };
}
