import { describe, expect, it } from '@jest/globals';

import { wcagCriteriaFromTags } from '../wcag.js';
import { AXE_RGAA_MAPPING } from './data/axe-mapping-4.1.2.generated.js';
import { activeRules, axeRule, rgaaLinksOf } from './mapping.js';
import { criterionById } from './referential.js';

describe('correspondence between axe-core rules and RGAA criteria', () => {
  it('was generated from the axe-core version the scanner runs', () => {
    expect(AXE_RGAA_MAPPING.axeVersion).toBe('4.13.0');
    expect(AXE_RGAA_MAPPING.sources.map((source) => source.license)).toEqual([
      expect.stringContaining('MPL-2.0'),
      expect.stringContaining('Licence Ouverte 2.0'),
    ]);
  });

  it('reads each rule’s WCAG criteria from its tags as the scanner does', () => {
    for (const rule of AXE_RGAA_MAPPING.rules) {
      expect(rule.wcag).toEqual(wcagCriteriaFromTags(rule.tags));
    }
  });

  it('cites, for every link, the axe-core tag it comes from and points to tests that exist', () => {
    for (const rule of AXE_RGAA_MAPPING.rules) {
      for (const link of rule.links) {
        const criterion = criterionById(link.criterion);
        expect(criterion).toBeDefined();
        for (const test of link.tests) {
          expect(rule.tags).toContain(`RGAA-${test}`);
          expect(criterion?.tests.map((t) => t.id)).toContain(test);
        }
        expect(link.reason).toContain(`RGAA-${link.tests[0] ?? ''}`);
      }
    }
  });

  it('confirms a link only when both sources agree on a WCAG criterion', () => {
    for (const rule of AXE_RGAA_MAPPING.rules) {
      for (const link of rule.links) {
        const official = criterionById(link.criterion)?.wcag.map((reference) => reference.id) ?? [];
        const agree = rule.wcag.some((id) => official.includes(id));
        expect(link.status).toBe(agree ? 'confirmed' : 'uncertain');
      }
    }
  });

  it('leaves no uncertain link once the editorial reviews are applied', () => {
    const generated = AXE_RGAA_MAPPING.rules.flatMap((rule) =>
      rule.links
        .filter((link) => link.status === 'uncertain')
        .map((link) => `${rule.ruleId} → ${link.criterion}`),
    );
    const reviewed = activeRules().flatMap((rule) =>
      rule.links
        .filter((link) => link.status === 'uncertain')
        .map((link) => `${rule.ruleId} → ${link.criterion}`),
    );

    expect(generated.sort()).toEqual([
      'area-alt → 1.1',
      'aria-meter-name → 11.1',
      'aria-progressbar-name → 11.1',
      'server-side-image-map → 1.1',
    ]);
    expect(reviewed).toEqual([]);
    expect(rgaaLinksOf('area-alt').links[0]?.reason).toContain('Revue du 14/10/2026');
  });

  it('attaches the defects planted in the test site to the expected criteria, with certainty', () => {
    const expected: Record<string, string> = {
      'image-alt': '1.1',
      label: '11.1',
      'color-contrast': '3.2',
      'link-name': '6.2',
      'html-has-lang': '8.3',
      'document-title': '8.5',
    };
    for (const [rule, criterion] of Object.entries(expected)) {
      expect(rgaaLinksOf(rule).links).toEqual([
        expect.objectContaining({ criterion, status: 'confirmed' }),
      ]);
    }
  });

  it('proposes candidates, never a link, for a rule without a reviewed criterion', () => {
    const unlinked = activeRules().filter((rule) => rule.links.length === 0);

    expect(unlinked.map((rule) => rule.ruleId).sort()).toEqual([
      'aria-braille-equivalent',
      'aria-meter-name',
      'aria-progressbar-name',
      'aria-roledescription',
      'aria-tooltip-name',
      'summary-name',
    ]);
    for (const rule of unlinked) {
      expect(rule.candidates.length).toBeGreaterThan(0);
    }
    expect(rgaaLinksOf('audio-caption').links).toEqual([
      expect.objectContaining({ criterion: '4.1', tests: ['4.1.1'], status: 'confirmed' }),
    ]);
  });

  it('knows nothing of a rule it has never heard of', () => {
    expect(axeRule('not-a-rule')).toBeUndefined();
    expect(rgaaLinksOf('not-a-rule')).toEqual({ links: [], candidates: [] });
  });

  it('runs the rules of the WCAG 2.1 A and AA scope, without the experimental ones', () => {
    const active = activeRules();

    expect(active).toHaveLength(64);
    expect(active.some((rule) => rule.experimental)).toBe(false);
    expect(axeRule('p-as-heading')?.experimental).toBe(true);
  });
});
