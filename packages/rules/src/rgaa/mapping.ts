import { AXE_RGAA_MAPPING } from './data/axe-mapping-4.1.2.generated.js';
import type { AxeRuleMapping, CriterionLink } from './types.js';

const rulesById = new Map(AXE_RGAA_MAPPING.rules.map((rule) => [rule.ruleId, rule]));

/** Everything known about an axe-core rule's place in the RGAA, or undefined for an unknown rule. */
export function axeRule(ruleId: string): AxeRuleMapping | undefined {
  return rulesById.get(ruleId);
}

/**
 * The RGAA criteria a defect found by an axe-core rule belongs to. Uncertain
 * links are returned too, marked as such: the interface shows them as "to
 * confirm", never as a fact. A rule with no link has `candidates` instead.
 */
export function rgaaLinksOf(ruleId: string): {
  readonly links: readonly CriterionLink[];
  readonly candidates: readonly string[];
} {
  const rule = rulesById.get(ruleId);
  return { links: rule?.links ?? [], candidates: rule?.candidates ?? [] };
}

/** The rules Rampe runs: those of the WCAG 2.1 A and AA scope that axe-core enables by default. */
export function activeRules(): readonly AxeRuleMapping[] {
  return AXE_RGAA_MAPPING.rules.filter((rule) => !rule.experimental);
}
