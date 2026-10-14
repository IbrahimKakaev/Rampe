import { describe, expect, it } from '@jest/globals';
import { MAX_VIOLATION_NODES_PER_PAGE } from '@rampe/shared';
import type { NodeResult, Result } from 'axe-core';

import { selectorOf, toViolations, truncateSnippet } from './axe-results.js';

function node(html: string, target: NodeResult['target'] = ['img']): NodeResult {
  return {
    html,
    target,
    any: [],
    all: [],
    none: [],
    failureSummary: 'Fix: Jean Dupont, 06 12 34 56 78',
  };
}

function rule(id: string, nodes: NodeResult[], tags = ['wcag2a', 'wcag111']): Result {
  return { id, impact: 'critical', tags, nodes, description: 'd', help: 'h', helpUrl: 'https://x' };
}

describe('truncateSnippet', () => {
  it('keeps a short extract as it is and cuts a long one at 500 characters', () => {
    expect(truncateSnippet('<img src="a.png">')).toBe('<img src="a.png">');
    expect(truncateSnippet('x'.repeat(800))).toHaveLength(500);
  });

  it('never cuts a character in half', () => {
    const text = `${'x'.repeat(499)}😀`;

    expect(truncateSnippet(text)).toBe('x'.repeat(499));
  });
});

describe('selectorOf', () => {
  it('writes frames and shadow roots in one string', () => {
    expect(selectorOf(['#logo'])).toBe('#logo');
    expect(selectorOf(['iframe#pub', 'img'])).toBe('iframe#pub | img');
    expect(selectorOf([['my-card', 'img']])).toBe('my-card >>> img');
  });
});

describe('toViolations', () => {
  it('keeps the rule, impact, WCAG criteria, selector and extract, and nothing else', () => {
    const { violations, truncated } = toViolations([
      rule('image-alt', [node('<img src="logo.png">', ['img.logo'])]),
    ]);

    expect(violations).toEqual([
      {
        ruleId: 'image-alt',
        impact: 'critical',
        wcag: ['1.1.1'],
        nodes: [{ selector: 'img.logo', html: '<img src="logo.png">' }],
      },
    ]);
    expect(JSON.stringify(violations)).not.toContain('Jean Dupont');
    expect(truncated).toBe(false);
  });

  it('records a missing impact as null', () => {
    const { impact: _impact, ...withoutImpact } = rule('x', [node('<p>')]);

    expect(toViolations([withoutImpact]).violations[0]?.impact).toBeNull();
  });

  it('cuts a page with too many defective elements and says so', () => {
    const many = Array.from({ length: MAX_VIOLATION_NODES_PER_PAGE - 1 }, () => node('<p>'));
    const { violations, truncated } = toViolations([
      rule('color-contrast', many),
      rule('link-name', [node('<a>'), node('<a>')]),
      rule('label', [node('<input>')]),
    ]);

    expect(violations.reduce((total, v) => total + v.nodes.length, 0)).toBe(
      MAX_VIOLATION_NODES_PER_PAGE,
    );
    expect(violations.map((v) => v.ruleId)).toEqual(['color-contrast', 'link-name']);
    expect(truncated).toBe(true);
  });
});
