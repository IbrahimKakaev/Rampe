import { AXE_RGAA_MAPPING } from './data/axe-mapping-4.1.2.generated.js';
import { CURRENT_REFERENTIAL } from './referential.js';
import { LINK_REVIEWS, type LinkReview } from './reviews.js';
import type { AxeRuleMapping, CriterionLink, RgaaCriterion } from './types.js';

/**
 * Applies the editorial reviews to the generated correspondence. Throws when a
 * review no longer matches the data, so that an axe-core update cannot silently
 * invalidate a decision.
 */
export function applyReviews(
  rules: readonly AxeRuleMapping[],
  reviews: readonly LinkReview[],
  criteria: readonly RgaaCriterion[],
): AxeRuleMapping[] {
  const byId = new Map(rules.map((rule) => [rule.ruleId, rule]));
  for (const review of reviews) {
    const rule = byId.get(review.ruleId);
    if (rule === undefined) {
      throw new Error(`Review of ${review.ruleId}: axe-core has no such rule`);
    }
    const link = rule.links.find((candidate) => candidate.criterion === review.criterion);
    let links: readonly CriterionLink[];
    if (review.decision === 'add') {
      const criterion = criteria.find((candidate) => candidate.id === review.criterion);
      const tests = review.tests ?? [];
      if (rule.links.length > 0 || criterion === undefined || tests.length === 0) {
        throw new Error(
          `Review of ${review.ruleId}: a link can only be added to an untagged rule, with tests`,
        );
      }
      if (!tests.every((test) => criterion.tests.some((candidate) => candidate.id === test))) {
        throw new Error(
          `Review of ${review.ruleId}: unknown test of criterion ${review.criterion}`,
        );
      }
      links = [
        { criterion: review.criterion, tests, status: 'confirmed', reason: review.justification },
      ];
    } else {
      if (link?.status !== 'uncertain') {
        throw new Error(
          `Review of ${review.ruleId}: no uncertain link to criterion ${review.criterion}`,
        );
      }
      links =
        review.decision === 'confirm'
          ? rule.links.map((candidate) =>
              candidate === link
                ? { ...link, status: 'confirmed', reason: review.justification }
                : candidate,
            )
          : rule.links.filter((candidate) => candidate !== link);
    }
    const candidates =
      links.length > 0
        ? []
        : criteria
            .filter((criterion) =>
              criterion.wcag.some((reference) => rule.wcag.includes(reference.id)),
            )
            .map((criterion) => criterion.id);
    byId.set(rule.ruleId, { ...rule, links, candidates });
  }
  // A Map keeps the order of its first insertions: the rules stay in their original order.
  return [...byId.values()];
}

/** The correspondence Rampe uses: generated from two sources, then reviewed. */
const REVIEWED_RULES = applyReviews(
  AXE_RGAA_MAPPING.rules,
  LINK_REVIEWS,
  CURRENT_REFERENTIAL.criteria,
);
const rulesById = new Map(REVIEWED_RULES.map((rule) => [rule.ruleId, rule]));

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
  return REVIEWED_RULES.filter((rule) => !rule.experimental);
}
