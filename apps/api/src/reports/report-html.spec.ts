import { describe, expect, it } from '@jest/globals';

import {
  buildReportHtml,
  MAX_OCCURRENCES_PER_RULE,
  type ReportData,
  type ReportFinding,
} from './report-html.js';

const imageAlt: ReportFinding = {
  ruleId: 'image-alt',
  title: 'Image sans alternative textuelle',
  fix: 'Ajoutez un attribut `alt` à l’image.',
  impact: 'critical',
  pagePath: '/accueil',
  selector: 'img.logo',
  html: '<img src="logo.png" onerror="alert(1)">',
  uncertain: [],
};

function data(overrides: Partial<ReportData> = {}): ReportData {
  return {
    generatedAt: new Date('2026-10-16T08:00:00.000Z'),
    organizationName: 'Boulangerie <Martin>',
    site: { origin: 'https://www.exemple.fr', host: 'www.exemple.fr' },
    scan: {
      createdAt: new Date('2026-10-15T08:00:00.000Z'),
      finishedAt: new Date('2026-10-15T08:02:00.000Z'),
      status: 'COMPLETED',
      stopReason: null,
      score: 0.875,
      checks: { passed: 70, failed: 10, incomplete: 3 },
      referentialVersion: '4.1.2',
      axeVersion: '4.13.0',
      findingsAdded: 2,
      findingsFixed: 1,
      maxDepth: 3,
    },
    pages: [
      { url: 'https://www.exemple.fr/accueil', analyzed: true, failure: null, findingCount: 1 },
      {
        url: 'https://www.exemple.fr/lent',
        analyzed: false,
        failure: 'Délai dépassé',
        findingCount: 0,
      },
    ],
    criteria: [{ id: '1.1', title: 'Chaque image porteuse d’information…', findings: [imageAlt] }],
    unattached: [
      {
        ...imageAlt,
        ruleId: 'aria-tooltip-name',
        title: 'Infobulle sans nom',
        fix: null,
        uncertain: ['11.1'],
      },
    ],
    manualCriteria: [
      {
        theme: '1. Images',
        criteria: [
          { id: '1.2', title: 'Chaque image de décoration…', partial: true },
          { id: '1.3', title: 'Pour chaque image porteuse…', partial: false },
        ],
      },
    ],
    criteriaToCheckManually: 105,
    findingCount: 2,
    ...overrides,
  };
}

const text = (html: string): string =>
  html
    .replace(/<style>[\s\S]*?<\/style>/, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

describe('buildReportHtml', () => {
  it('has the cover page, the summary, the scope, the defects by criterion and the criteria to check by hand', () => {
    const html = buildReportHtml(data());
    const headings = [...html.matchAll(/<h([12])>([^<]+)<\/h\1>/g)].map(([, , title]) => title);

    expect(headings).toEqual([
      'Rapport de pré-audit automatique d’accessibilité',
      'Synthèse',
      'Périmètre',
      'Défauts par critère RGAA',
      'Critères à vérifier manuellement',
      'Méthode et limites',
    ]);
    expect(text(html)).toContain('Scan terminé le 15 octobre 2026 à 10:02');
    expect(text(html)).toContain('https://www.exemple.fr/');
  });

  it('is in French, with a title, so that the tagged PDF has its language and name', () => {
    const html = buildReportHtml(data());

    expect(html).toContain('<html lang="fr">');
    expect(html).toContain(
      '<title>Pré-audit automatique d’accessibilité de www.exemple.fr</title>',
    );
  });

  it('says it is an automated pre-audit, with the number of criteria to check by hand, and never calls the site « conforme »', () => {
    const content = text(buildReportHtml(data()));

    expect(content).toContain('Ce rapport présente un pré-audit automatique.');
    expect(content).toContain('105 critères RGAA restent à vérifier manuellement');
    expect(content).not.toMatch(/\b(non[\s-])?conformes?\b/i);
  });

  it('lists the defects under their criterion, with the page, the element, the extract, the impact and the fix', () => {
    const content = text(buildReportHtml(data()));

    expect(content).toContain('Critère 1.1 : Chaque image porteuse d’information…');
    expect(content).toContain('Image sans alternative textuelle');
    expect(content).toContain('Comment corriger : Ajoutez un attribut alt à l’image.');
    expect(content).toContain('/accueil');
    expect(content).toContain('img.logo');
    expect(content).toContain('Critique');
  });

  it('keeps the defects without a confirmed criterion apart, with the criteria to confirm', () => {
    const content = text(buildReportHtml(data()));

    expect(content).toContain('Défauts sans critère RGAA confirmé');
    expect(content).toContain('Critère RGAA à confirmer : 11.1.');
  });

  it('escapes everything that comes from the scanned site or the customer', () => {
    const html = buildReportHtml(data());

    expect(html).not.toContain('<img src="logo.png"');
    expect(html).toContain('&lt;img src=&quot;logo.png&quot; onerror=&quot;alert(1)&quot;&gt;');
    expect(html).toContain('Boulangerie &lt;Martin&gt;');
  });

  it('lists the criteria the robot cannot decide, saying which ones it tests in part', () => {
    const content = text(buildReportHtml(data()));

    expect(content).toContain(
      '1.2 Chaque image de décoration… Partielle : le robot en teste une partie',
    );
    expect(content).toContain('1.3 Pour chaque image porteuse… Aucune : vérification humaine');
  });

  it('gives the evolution since the previous scan, or says there is none to compare with', () => {
    expect(text(buildReportHtml(data()))).toContain('2 nouveaux défauts, 1 défaut corrigé');
    expect(
      text(
        buildReportHtml(
          data({ scan: { ...data().scan, findingsAdded: null, findingsFixed: null } }),
        ),
      ),
    ).toContain('aucune comparaison possible');
  });

  it('counts the occurrences of a rule beyond those it lists', () => {
    const many = Array.from({ length: MAX_OCCURRENCES_PER_RULE + 3 }, (_, index) => ({
      ...imageAlt,
      selector: `img:nth-child(${String(index + 1)})`,
    }));
    const html = buildReportHtml(
      data({ criteria: [{ id: '1.1', title: 'Images', findings: many }], unattached: [] }),
    );

    expect(html.match(/<tr>\s*<td><code>\/accueil/g)).toHaveLength(MAX_OCCURRENCES_PER_RULE);
    expect(text(html)).toContain('Et 3 autres occurrences');
  });

  it('says that no defect found proves nothing', () => {
    const content = text(buildReportHtml(data({ criteria: [], unattached: [], findingCount: 0 })));

    expect(content).toContain(
      'Le robot n’a détecté aucun défaut. Cela ne prouve pas l’accessibilité du site',
    );
  });
});
