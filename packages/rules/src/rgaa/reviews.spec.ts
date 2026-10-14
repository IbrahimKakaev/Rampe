import { describe, expect, it } from '@jest/globals';

import { applyReviews } from './mapping.js';
import type { AxeRuleMapping, RgaaCriterion } from './types.js';

const criteria: RgaaCriterion[] = [
  {
    id: '1.1',
    theme: 1,
    title: 'Images',
    tests: [{ id: '1.1.1', text: ['?'] }],
    wcag: [{ id: '1.1.1', level: 'A' }],
    techniques: [],
    particularCases: [],
    technicalNotes: [],
  },
];
const uncertain = {
  criterion: '1.1',
  tests: ['1.1.1'],
  status: 'uncertain' as const,
  reason: 'sources en désaccord',
};
const rule = (
  ruleId: string,
  links: AxeRuleMapping['links'],
  wcag = ['1.1.1'],
): AxeRuleMapping => ({
  ruleId,
  experimental: false,
  tags: [],
  wcag,
  links,
  candidates: [],
});

describe('applyReviews', () => {
  it('confirms an uncertain link, with the justification as its reason', () => {
    const [reviewed] = applyReviews(
      [rule('a', [uncertain])],
      [
        {
          ruleId: 'a',
          criterion: '1.1',
          decision: 'confirm',
          justification: 'Le test 1.1.1 le dit.',
        },
      ],
      criteria,
    );

    expect(reviewed?.links).toEqual([
      { ...uncertain, status: 'confirmed', reason: 'Le test 1.1.1 le dit.' },
    ]);
  });

  it('confirms only the reviewed link of a rule that has several', () => {
    const other = {
      criterion: '8.3',
      tests: ['8.3.1'],
      status: 'uncertain' as const,
      reason: 'autre',
    };
    const [reviewed] = applyReviews(
      [rule('a', [other, uncertain])],
      [{ ruleId: 'a', criterion: '1.1', decision: 'confirm', justification: 'Revu.' }],
      criteria,
    );

    expect(reviewed?.links.map((link) => link.status)).toEqual(['uncertain', 'confirmed']);
  });

  it('removes a rejected link and falls back to candidates', () => {
    const [reviewed] = applyReviews(
      [rule('a', [uncertain])],
      [{ ruleId: 'a', criterion: '1.1', decision: 'reject', justification: 'Hors sujet.' }],
      criteria,
    );

    expect(reviewed).toMatchObject({ links: [], candidates: ['1.1'] });
  });

  it('adds a link to a rule axe-core does not tag', () => {
    const [reviewed] = applyReviews(
      [rule('a', [], ['9.9.9'])],
      [
        {
          ruleId: 'a',
          criterion: '1.1',
          decision: 'add',
          tests: ['1.1.1'],
          justification: 'Même test.',
        },
      ],
      criteria,
    );

    expect(reviewed).toMatchObject({
      links: [{ criterion: '1.1', tests: ['1.1.1'], status: 'confirmed', reason: 'Même test.' }],
      candidates: [],
    });
  });

  it.each([
    [
      'an unknown rule',
      [rule('a', [uncertain])],
      { ruleId: 'b', criterion: '1.1', decision: 'confirm' },
      'no such rule',
    ],
    [
      'a link that is not uncertain',
      [rule('a', [{ ...uncertain, status: 'confirmed' }])],
      { ruleId: 'a', criterion: '1.1', decision: 'reject' },
      'no uncertain link',
    ],
    [
      'a link that does not exist',
      [rule('a', [])],
      { ruleId: 'a', criterion: '1.1', decision: 'confirm' },
      'no uncertain link',
    ],
    [
      'an addition to a tagged rule',
      [rule('a', [uncertain])],
      { ruleId: 'a', criterion: '1.1', decision: 'add', tests: ['1.1.1'] },
      'untagged rule',
    ],
    [
      'an addition without tests',
      [rule('a', [])],
      { ruleId: 'a', criterion: '1.1', decision: 'add' },
      'untagged rule',
    ],
    [
      'an addition to an unknown criterion',
      [rule('a', [])],
      { ruleId: 'a', criterion: '9.9', decision: 'add', tests: ['9.9.1'] },
      'untagged rule',
    ],
    [
      'an addition of an unknown test',
      [rule('a', [])],
      { ruleId: 'a', criterion: '1.1', decision: 'add', tests: ['1.1.9'] },
      'unknown test',
    ],
  ] as const)('refuses %s', (_label, rules, review, message) => {
    expect(() => applyReviews(rules, [{ ...review, justification: 'x' }], criteria)).toThrow(
      message,
    );
  });

  it('leaves the rules no review mentions as they are', () => {
    const untouched = rule('z', [uncertain]);

    expect(applyReviews([untouched], [], criteria)).toEqual([untouched]);
  });
});
