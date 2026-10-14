import { describe, expect, it } from '@jest/globals';

import { compareRgaaIds, criterionById, CURRENT_REFERENTIAL } from './referential.js';

describe('RGAA 4.1.2 referential', () => {
  it('has the 13 themes, 106 criteria and 258 tests of the official text', () => {
    expect(CURRENT_REFERENTIAL.version).toBe('4.1.2');
    expect(CURRENT_REFERENTIAL.themes).toHaveLength(13);
    expect(CURRENT_REFERENTIAL.criteria).toHaveLength(106);
    expect(CURRENT_REFERENTIAL.criteria.flatMap((criterion) => criterion.tests)).toHaveLength(258);
  });

  it('cites its source: the official file at a fixed commit, under the Licence Ouverte', () => {
    expect(CURRENT_REFERENTIAL.source).toMatchObject({
      url: expect.stringContaining(
        'github.com/DISIC/accessibilite.numerique.gouv.fr/blob/95d5ef33',
      ),
      commit: '95d5ef33df9efe7c862da02ea98c6b8c02909007',
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      license: expect.stringContaining('Licence Ouverte 2.0'),
    });
  });

  it('numbers criteria and tests after their theme, in order and without duplicates', () => {
    const ids = CURRENT_REFERENTIAL.criteria.map((criterion) => criterion.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort(compareRgaaIds)).toEqual(ids);
    for (const criterion of CURRENT_REFERENTIAL.criteria) {
      expect(criterion.id.startsWith(`${String(criterion.theme)}.`)).toBe(true);
      for (const test of criterion.tests) {
        expect(test.id.startsWith(`${criterion.id}.`)).toBe(true);
      }
    }
  });

  it('gives every criterion its WCAG references and plain text without Markdown links', () => {
    for (const criterion of CURRENT_REFERENTIAL.criteria) {
      expect(criterion.wcag.length).toBeGreaterThan(0);
      const text = JSON.stringify([
        criterion.title,
        criterion.tests,
        criterion.particularCases,
        criterion.technicalNotes,
      ]);
      expect(text).not.toMatch(/\]\(#/);
    }
  });

  it('reads criterion 8.5 as the official text words it', () => {
    expect(criterionById('8.5')).toMatchObject({
      // The official text keeps French typography: a non-breaking space before "?".
      title: 'Chaque page web a-t-elle un titre de page\u00a0?',
      wcag: [{ id: '2.4.2', level: 'A' }],
      tests: [
        {
          id: '8.5.1',
          text: ['Chaque page web a-t-elle un titre de page (balise `<title>`)\u00a0?'],
        },
      ],
    });
    expect(criterionById('14.1')).toBeUndefined();
  });
});

describe('compareRgaaIds', () => {
  it('orders numbers part by part, so that 1.2 comes before 1.10', () => {
    expect(['1.10', '1.2', '10.1', '2.1', '1.2.1', '1.2'].sort(compareRgaaIds)).toEqual([
      '1.2',
      '1.2',
      '1.2.1',
      '1.10',
      '2.1',
      '10.1',
    ]);
  });
});
