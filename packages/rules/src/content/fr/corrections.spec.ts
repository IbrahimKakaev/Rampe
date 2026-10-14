import { describe, expect, it } from '@jest/globals';

import { activeRules, axeRule } from '../../rgaa/mapping.js';
import { CORRECTIONS_FR } from './corrections.js';

describe('French corrections', () => {
  it('explain every rule Rampe runs', () => {
    const missing = activeRules()
      .map((rule) => rule.ruleId)
      .filter((ruleId) => !(ruleId in CORRECTIONS_FR));

    expect(missing).toEqual([]);
  });

  it('explain no rule that Rampe does not run', () => {
    const unknown = Object.keys(CORRECTIONS_FR).filter(
      (ruleId) => axeRule(ruleId) === undefined || axeRule(ruleId)?.experimental === true,
    );

    expect(unknown).toEqual([]);
  });

  it('give a short title, the impact and the fix, as finished sentences', () => {
    const malformed = Object.entries(CORRECTIONS_FR).filter(
      ([, { title, impact, fix }]) =>
        title.length > 80 ||
        /[.:;]$/.test(title) ||
        [impact, fix].some((sentence) => sentence.length <= 30 || !/[.)…]$/.test(sentence)),
    );

    expect(malformed.map(([ruleId]) => ruleId)).toEqual([]);
  });

  it('never call a page compliant: they explain defects', () => {
    const text = JSON.stringify(CORRECTIONS_FR).toLowerCase();

    expect(text).not.toMatch(/\bconforme\b/);
  });
});
