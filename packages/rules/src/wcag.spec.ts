import { describe, expect, it } from '@jest/globals';

import { wcagCriteriaFromTags } from './wcag.js';

describe('wcagCriteriaFromTags', () => {
  it('reads the success criteria of a rule', () => {
    expect(
      wcagCriteriaFromTags(['cat.text-alternatives', 'wcag2a', 'wcag111', 'RGAA-1.1.1']),
    ).toEqual(['1.1.1']);
  });

  it('reads two-digit criterion numbers', () => {
    expect(wcagCriteriaFromTags(['wcag21aa', 'wcag1412', 'wcag1410'])).toEqual([
      '1.4.10',
      '1.4.12',
    ]);
  });

  it('sorts in the WCAG order, not the alphabetical one, and drops duplicates', () => {
    expect(wcagCriteriaFromTags(['wcag412', 'wcag1410', 'wcag143', 'wcag143', 'wcag244'])).toEqual([
      '1.4.3',
      '1.4.10',
      '2.4.4',
      '4.1.2',
    ]);
  });

  it('ignores conformance levels and other tags', () => {
    expect(
      wcagCriteriaFromTags([
        'wcag2a',
        'wcag2aa',
        'wcag21a',
        'wcag22aa',
        'best-practice',
        'wcag',
        'wcag11',
      ]),
    ).toEqual([]);
  });

  it('returns nothing for a rule without tags', () => {
    expect(wcagCriteriaFromTags([])).toEqual([]);
  });
});
