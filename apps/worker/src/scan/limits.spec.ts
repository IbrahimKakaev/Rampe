import { describe, expect, it } from '@jest/globals';
import { SCAN_DEFAULTS } from '@rampe/shared';

import { InvalidLimitError, limitsFromOptions } from './limits.js';

describe('limitsFromOptions', () => {
  it('uses the limits of the specification by default', () => {
    expect(limitsFromOptions({})).toEqual(SCAN_DEFAULTS);
  });

  it('accepts tighter limits and a page count up to the ceiling', () => {
    expect(
      limitsFromOptions({
        maxPages: '200',
        maxDepth: '1',
        pageTimeoutMs: '5000',
        scanTimeoutMs: '60000',
      }),
    ).toMatchObject({ maxPages: 200, maxDepth: 1, pageTimeoutMs: 5000, scanTimeoutMs: 60_000 });
  });

  it.each([
    [{ maxPages: '0' }, 'max-pages'],
    [{ maxPages: '201' }, 'max-pages'],
    [{ maxPages: '2.5' }, 'max-pages'],
    [{ maxPages: '1e2' }, 'max-pages'],
    [{ maxDepth: '4' }, 'max-depth'],
    [{ pageTimeoutMs: '60000' }, 'page-timeout-ms'],
    [{ scanTimeoutMs: '3600000' }, 'scan-timeout-ms'],
    [{ scanTimeoutMs: '500' }, 'scan-timeout-ms'],
  ])('refuses %o', (options, name) => {
    expect(() => limitsFromOptions(options)).toThrow(InvalidLimitError);
    expect(() => limitsFromOptions(options)).toThrow(name);
  });
});
