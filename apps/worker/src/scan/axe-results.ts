import { wcagCriteriaFromTags } from '@rampe/rules';
import {
  HTML_SNIPPET_MAX_LENGTH,
  MAX_VIOLATION_NODES_PER_PAGE,
  type Violation,
} from '@rampe/shared';
import type { NodeResult, Result } from 'axe-core';

/** The WCAG 2.1 levels A and AA, which the RGAA 4.1.2 is built on. */
export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * Cuts an HTML extract to the length the scan keeps. A character outside the
 * Basic Multilingual Plane takes two UTF-16 units: it is never cut in half.
 */
export function truncateSnippet(html: string, maxLength = HTML_SNIPPET_MAX_LENGTH): string {
  if (html.length <= maxLength) {
    return html;
  }
  const cut = html.slice(0, maxLength);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

/**
 * Writes the selector axe-core gives for an element as one string. Frames are
 * separated by " | " and shadow roots by " >>> ".
 */
export function selectorOf(target: NodeResult['target']): string {
  return target
    .map((part) => (typeof part === 'string' ? part : [part].flat(Infinity).join(' >>> ')))
    .join(' | ');
}

/**
 * Keeps what the scan stores of axe-core's violations: rule, impact, WCAG
 * criteria, selector and a short HTML extract per element. Descriptions,
 * failure summaries and the element's text are left out: they are not needed,
 * and may contain personal data shown on the page.
 */
export function toViolations(results: readonly Result[]): {
  violations: Violation[];
  truncated: boolean;
} {
  let budget = MAX_VIOLATION_NODES_PER_PAGE;
  let truncated = false;
  const violations: Violation[] = [];
  for (const result of results) {
    if (budget === 0) {
      truncated = true;
      break;
    }
    const nodes = result.nodes.slice(0, budget);
    truncated ||= nodes.length < result.nodes.length;
    budget -= nodes.length;
    violations.push({
      ruleId: result.id,
      impact: result.impact ?? null,
      wcag: wcagCriteriaFromTags(result.tags),
      nodes: nodes.map((node) => ({
        selector: selectorOf(node.target),
        html: truncateSnippet(node.html),
      })),
    });
  }
  return { violations, truncated };
}
