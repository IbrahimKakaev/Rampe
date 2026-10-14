/**
 * Criteria that automated rules decide in both directions: a failing rule
 * proves a defect, and a passing rule proves that the criterion is met. This
 * is an editorial decision, made criterion by criterion and justified here; it
 * is not derived. It is deliberately short: a criterion that needs any human
 * judgement does not belong here.
 */
export const AUTOMATABLE_CRITERIA: Readonly<Record<string, string>> = {
  '8.5':
    "Le critère n'a qu'un test, la présence d'un titre de page (élément title). La règle document-title le tranche dans les deux sens : elle échoue si la page n'a pas de titre non vide, et réussit sinon. La pertinence du titre relève d'un autre critère (8.6).",
};
