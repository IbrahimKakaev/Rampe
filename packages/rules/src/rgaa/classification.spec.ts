import { describe, expect, it } from '@jest/globals';

import { CLASSIFICATION, classifyCriteria, criteriaToCheckManually } from './classification.js';
import type { AxeRuleMapping, RgaaCriterion } from './types.js';

function criterion(id: string, tests: number): RgaaCriterion {
  return {
    id,
    theme: Number(id.split('.')[0]),
    title: `Critère ${id}`,
    tests: Array.from({ length: tests }, (_, index) => ({
      id: `${id}.${String(index + 1)}`,
      text: ['?'],
    })),
    wcag: [{ id: '1.1.1', level: 'A' }],
    techniques: [],
    particularCases: [],
    technicalNotes: [],
  };
}

function rule(ruleId: string, links: AxeRuleMapping['links']): AxeRuleMapping {
  return { ruleId, experimental: false, tags: [], wcag: [], links, candidates: [] };
}

const link = (
  criterion: string,
  tests: string[],
  status: 'confirmed' | 'uncertain' = 'confirmed',
) => ({
  criterion,
  tests,
  status,
  reason: 'test',
});

describe('classifyCriteria', () => {
  const criteria = [
    criterion('1.1', 3),
    criterion('2.1', 1),
    criterion('3.1', 2),
    criterion('4.1', 1),
  ];
  const rules = [
    rule('a', [link('1.1', ['1.1.1']), link('2.1', ['2.1.1'])]),
    rule('b', [link('1.1', ['1.1.2']), link('3.1', ['3.1.1'], 'uncertain')]),
    rule('c', [link('4.1', ['4.1.1'])]),
  ];

  it('classifies as manual a criterion no rule is linked to with certainty, naming uncertain rules', () => {
    const [, , third] = classifyCriteria(criteria, rules, {});

    expect(third).toEqual({
      criterion: '3.1',
      automation: 'manual',
      rules: [],
      testsCovered: [],
      uncertainRules: ['b'],
      justification:
        "Aucune règle automatique ne s'y rattache avec certitude : le critère se vérifie à la main. Correspondance incertaine, à arbitrer : b.",
    });
  });

  it('classifies as partial a criterion some rules check, and says which tests they cover', () => {
    const [first, second] = classifyCriteria(criteria, rules, {});

    expect(first).toMatchObject({
      automation: 'partial',
      rules: ['a', 'b'],
      testsCovered: ['1.1.1', '1.1.2'],
    });
    expect(first?.justification).toBe(
      'Les règles a, b détectent des défauts pour les tests 1.1.1, 1.1.2 (sur 3), mais aucune ne peut prouver que le critère est respecté : une vérification à la main reste nécessaire.',
    );
    expect(second?.justification).toContain('pour le test 2.1.1 (sur 1)');
  });

  it('classifies as automatable only the criteria declared so, with their justification', () => {
    const classification = classifyCriteria(criteria, rules, {
      '4.1': 'La règle c tranche dans les deux sens.',
    });

    expect(classification[3]).toMatchObject({
      automation: 'automatable',
      justification: 'La règle c tranche dans les deux sens.',
    });
  });

  it('refuses an automatable criterion that does not exist or that no rule checks', () => {
    expect(() => classifyCriteria(criteria, rules, { '9.9': 'x' })).toThrow('does not exist');
    expect(() => classifyCriteria(criteria, rules, { '3.1': 'x' })).toThrow('no rule is linked');
  });
});

describe('classification of RGAA 4.1.2', () => {
  it('classifies all 106 criteria, each with a justification', () => {
    expect(CLASSIFICATION).toHaveLength(106);
    for (const entry of CLASSIFICATION) {
      expect(entry.justification.length).toBeGreaterThan(20);
    }
  });

  it('counts 1 automatable criterion, 25 partially automatable and 80 manual', () => {
    const count = (automation: string): number =>
      CLASSIFICATION.filter((entry) => entry.automation === automation).length;

    expect([count('automatable'), count('partial'), count('manual')]).toEqual([1, 25, 80]);
    expect(CLASSIFICATION.find((entry) => entry.criterion === '8.5')?.automation).toBe(
      'automatable',
    );
  });

  it('leaves 105 criteria to check by hand after an automated pre-audit', () => {
    expect(criteriaToCheckManually()).toBe(105);
  });
});
