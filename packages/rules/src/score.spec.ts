import { describe, expect, it } from '@jest/globals';

import { automaticScore } from './score.js';

describe('automaticScore', () => {
  it('is the share of passed checks', () => {
    expect(automaticScore({ passed: 3, failed: 1 })).toBe(0.75);
    expect(automaticScore({ passed: 41, failed: 9 })).toBe(0.82);
  });

  it('is 1 when nothing failed and 0 when nothing passed', () => {
    expect(automaticScore({ passed: 12, failed: 0 })).toBe(1);
    expect(automaticScore({ passed: 0, failed: 7 })).toBe(0);
  });

  it('is null when no check could be decided', () => {
    expect(automaticScore({ passed: 0, failed: 0 })).toBeNull();
  });

  it.each([
    ['a negative count', { passed: -1, failed: 2 }, 'passed'],
    ['a fractional count', { passed: 1, failed: 0.5 }, 'failed'],
    ['NaN', { passed: Number.NaN, failed: 0 }, 'passed'],
    ['an infinite count', { passed: 1, failed: Number.POSITIVE_INFINITY }, 'failed'],
  ])('rejects %s', (_label, counts, field) => {
    expect(() => automaticScore(counts)).toThrow(RangeError);
    expect(() => automaticScore(counts)).toThrow(`${field} must be a non-negative integer`);
  });
});
