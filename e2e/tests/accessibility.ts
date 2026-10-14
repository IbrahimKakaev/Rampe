import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** The rule set Rampe applies to its customers' sites: it must pass it itself. */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * Fails on any accessibility violation axe-core can detect on the current page.
 * The project requirement is "no serious or critical violation"; holding the
 * application to zero violations of any impact is stricter and simpler to keep.
 */
export async function expectNoAccessibilityViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const summary = results.violations.map(({ id, impact, nodes }) => ({
    rule: id,
    impact,
    elements: nodes.map((node) => node.target.join(' ')),
  }));
  expect(summary).toEqual([]);
}
