/**
 * Editorial decisions on the correspondence between axe-core rules and RGAA
 * criteria, where the two generated sources disagree or say nothing. Each one
 * rests on a third, official source: the wording of the RGAA test itself.
 *
 * - confirm: an uncertain link becomes confirmed;
 * - reject: an uncertain link is removed;
 * - add: a link is given to a rule axe-core does not tag.
 *
 * A decision that no longer matches the generated data (after an axe-core
 * update, for example) makes the package fail to load: it must be reviewed.
 */
export interface LinkReview {
  readonly ruleId: string;
  readonly criterion: string;
  readonly decision: 'confirm' | 'reject' | 'add';
  /** For "add" only: the RGAA tests the rule checks. */
  readonly tests?: readonly string[];
  readonly justification: string;
}

export const LINK_REVIEWS: readonly LinkReview[] = [
  {
    ruleId: 'area-alt',
    criterion: '1.1',
    decision: 'confirm',
    justification:
      'Revue du 14/10/2026 : le test 1.1.2 demande si « chaque zone d’une image réactive (balise <area>) porteuse d’information a une alternative textuelle », ce que vérifie exactement la règle. Seules les références WCAG diffèrent (2.4.4 et 4.1.2 pour axe-core, 1.1.1 pour le RGAA).',
  },
  {
    ruleId: 'server-side-image-map',
    criterion: '1.1',
    decision: 'confirm',
    justification:
      'Revue du 14/10/2026 : le test 1.1.4 porte sur les zones cliquables d’une image réactive côté serveur, que la règle détecte. Seules les références WCAG diffèrent (2.1.1 pour axe-core, 1.1.1 pour le RGAA).',
  },
  {
    ruleId: 'aria-meter-name',
    criterion: '11.1',
    decision: 'reject',
    justification:
      'Revue du 14/10/2026 : le critère 11.1 porte sur les champs de formulaire ; une jauge (role="meter") n’en est pas un.',
  },
  {
    ruleId: 'aria-progressbar-name',
    criterion: '11.1',
    decision: 'reject',
    justification:
      'Revue du 14/10/2026 : le critère 11.1 porte sur les champs de formulaire ; une barre de progression n’en est pas un.',
  },
  {
    ruleId: 'audio-caption',
    criterion: '4.1',
    decision: 'add',
    tests: ['4.1.1'],
    justification:
      'Revue du 14/10/2026 : le test 4.1.1 demande une transcription textuelle des médias seulement audio, et partage le critère WCAG 1.2.1 avec la règle. Une transcription adjacente satisfait le RGAA sans piste de sous-titres : un défaut signalé par la règle reste à confirmer à la main.',
  },
  {
    ruleId: 'avoid-inline-spacing',
    criterion: '10.12',
    decision: 'add',
    tests: ['10.12.1'],
    justification:
      'Revue du 14/10/2026 : le test 10.12.1 vérifie que le texte reste lisible quand l’utilisateur modifie les espacements, et partage le critère WCAG 1.4.12 avec la règle, qui détecte les espacements imposés avec !important.',
  },
];
