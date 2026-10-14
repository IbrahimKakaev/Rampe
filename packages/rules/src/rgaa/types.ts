/** Where a piece of reference data comes from. */
export interface DataSource {
  readonly description: string;
  readonly url: string;
  readonly license: string;
}

export interface WcagReference {
  /** Success criterion, such as "1.1.1". */
  readonly id: string;
  readonly level: 'A' | 'AA';
}

export interface RgaaTest {
  /** Such as "1.1.1": criterion 1.1, test 1. */
  readonly id: string;
  /** The question of the test, then its conditions if it lists any. */
  readonly text: readonly string[];
}

export interface RgaaTheme {
  readonly number: number;
  readonly title: string;
}

export interface RgaaCriterion {
  /** Such as "1.1": theme 1, criterion 1. */
  readonly id: string;
  readonly theme: number;
  readonly title: string;
  readonly tests: readonly RgaaTest[];
  readonly wcag: readonly WcagReference[];
  readonly techniques: readonly string[];
  readonly particularCases: readonly string[];
  readonly technicalNotes: readonly string[];
}

export interface RgaaReferential {
  readonly version: string;
  readonly source: DataSource & { readonly commit: string; readonly sha256: string };
  readonly themes: readonly RgaaTheme[];
  readonly criteria: readonly RgaaCriterion[];
}

/**
 * How sure the link between an axe-core rule and an RGAA criterion is.
 * - confirmed: axe-core tags the rule with a test of the criterion, and the
 *   official references of the criterion include a WCAG criterion of the rule;
 * - uncertain: the two sources disagree. The link is shown as "to confirm",
 *   never asserted.
 */
export type MappingStatus = 'confirmed' | 'uncertain';

export interface CriterionLink {
  readonly criterion: string;
  /** RGAA tests axe-core names for the rule, such as "1.1.1". */
  readonly tests: readonly string[];
  readonly status: MappingStatus;
  /** Why the link has this status, in French, for the auditor. */
  readonly reason: string;
}

export interface AxeRuleMapping {
  readonly ruleId: string;
  /** Experimental rules do not run unless enabled; Rampe does not enable them. */
  readonly experimental: boolean;
  /** Tags as axe-core publishes them: the source of every link below. */
  readonly tags: readonly string[];
  readonly wcag: readonly string[];
  readonly links: readonly CriterionLink[];
  /**
   * When axe-core gives the rule no RGAA tag: the criteria whose official WCAG
   * references include a WCAG criterion of the rule. Candidates only.
   */
  readonly candidates: readonly string[];
}

export interface AxeRgaaMapping {
  readonly axeVersion: string;
  readonly referential: string;
  readonly sources: readonly DataSource[];
  readonly rules: readonly AxeRuleMapping[];
}
