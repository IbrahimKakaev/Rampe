import { AUTOMATABLE_CRITERIA } from './automatable.js';
import { activeRules } from './mapping.js';
import { compareRgaaIds, CURRENT_REFERENTIAL } from './referential.js';
import type { AxeRuleMapping, RgaaCriterion } from './types.js';

/**
 * - automatable: automated rules decide the criterion in both directions;
 * - partial: automated rules find some defects but cannot prove the criterion
 *   is met: a person must check it;
 * - manual: no automated rule applies.
 */
export type Automation = 'automatable' | 'partial' | 'manual';

export interface CriterionClassification {
  readonly criterion: string;
  readonly automation: Automation;
  /** Active rules linked to the criterion with certainty. */
  readonly rules: readonly string[];
  /** RGAA tests those rules check, at least in part. */
  readonly testsCovered: readonly string[];
  /** Active rules whose link to the criterion is uncertain. */
  readonly uncertainRules: readonly string[];
  readonly justification: string;
}

function list(items: readonly string[]): string {
  return items.join(', ');
}

export function classifyCriteria(
  criteria: readonly RgaaCriterion[],
  rules: readonly AxeRuleMapping[],
  automatable: Readonly<Record<string, string>>,
): CriterionClassification[] {
  const known = new Set(criteria.map((criterion) => criterion.id));
  for (const id of Object.keys(automatable)) {
    if (!known.has(id)) {
      throw new Error(`Criterion ${id} is declared automatable but does not exist`);
    }
  }

  return criteria.map((criterion) => {
    const linked = rules.flatMap((rule) =>
      rule.links
        .filter((link) => link.criterion === criterion.id)
        .map((link) => ({ rule: rule.ruleId, link })),
    );
    const confirmed = linked.filter(({ link }) => link.status === 'confirmed');
    const ruleIds = [...new Set(confirmed.map(({ rule }) => rule))].sort();
    const testsCovered = [...new Set(confirmed.flatMap(({ link }) => link.tests))].sort(
      compareRgaaIds,
    );
    const uncertainRules = [
      ...new Set(linked.filter(({ link }) => link.status === 'uncertain').map(({ rule }) => rule)),
    ].sort();
    const uncertainNote =
      uncertainRules.length > 0
        ? ` Correspondance incertaine, à arbitrer : ${list(uncertainRules)}.`
        : '';

    const override = automatable[criterion.id];
    if (override !== undefined) {
      if (ruleIds.length === 0) {
        throw new Error(
          `Criterion ${criterion.id} is declared automatable but no rule is linked to it`,
        );
      }
      return {
        criterion: criterion.id,
        automation: 'automatable',
        rules: ruleIds,
        testsCovered,
        uncertainRules,
        justification: override,
      };
    }
    if (ruleIds.length === 0) {
      return {
        criterion: criterion.id,
        automation: 'manual',
        rules: ruleIds,
        testsCovered,
        uncertainRules,
        justification: `Aucune règle automatique ne s'y rattache avec certitude : le critère se vérifie à la main.${uncertainNote}`,
      };
    }
    return {
      criterion: criterion.id,
      automation: 'partial',
      rules: ruleIds,
      testsCovered,
      uncertainRules,
      justification:
        `Les règles ${list(ruleIds)} détectent des défauts pour ${testsCovered.length > 1 ? 'les tests' : 'le test'} ${list(testsCovered)}` +
        ` (sur ${String(criterion.tests.length)}), mais aucune ne peut prouver que le critère est respecté : une vérification à la main reste nécessaire.${uncertainNote}`,
    };
  });
}

/** The classification of every criterion of the current referential. */
export const CLASSIFICATION: readonly CriterionClassification[] = classifyCriteria(
  CURRENT_REFERENTIAL.criteria,
  activeRules(),
  AUTOMATABLE_CRITERIA,
);

/**
 * How many criteria the automated pre-audit leaves to check by hand: every
 * criterion it cannot decide on its own. The interface shows this number next
 * to every automated score.
 */
export function criteriaToCheckManually(
  classification: readonly CriterionClassification[] = CLASSIFICATION,
): number {
  return classification.filter((entry) => entry.automation !== 'automatable').length;
}
