import { describe, expect, it } from '@jest/globals';
import type { Conformity, StatementFields } from '@rampe/shared';

import { buildStatement, type StatementInput } from './statement.js';

const fields: StatementFields = {
  entityName: 'Mairie de Exemple',
  serviceName: 'Site de la mairie',
  auditedBy: 'Société Audit',
  derogations: '',
  exemptions: 'Cartes interactives\nVidéos d’archives',
  technologies: '',
  testEnvironment: '',
  tools: '',
  contactFormUrl: '',
  contactDetails: '',
  multiYearPlanUrl: 'https://exemple.fr/schema',
  actionPlanUrl: '',
};

const complete: Conformity = {
  evaluated: 212,
  expected: 212,
  complete: true,
  validated: 50,
  invalidated: 0,
  notApplicable: 56,
  rate: 1,
  averageRate: 1,
  state: 'total',
};

const input = (overrides: Partial<StatementInput> = {}): StatementInput => ({
  fields,
  siteOrigin: 'https://exemple.fr',
  referentialVersion: '4.1.2',
  conformity: complete,
  nonConforming: [],
  pages: [{ title: 'Accueil', url: 'https://exemple.fr/' }],
  lastEvaluationAt: new Date('2026-10-15T10:00:00.000Z'),
  generatedAt: new Date('2026-10-16T10:00:00.000Z'),
  axeVersion: '4.13.0',
  ...overrides,
});

const text = (statement: ReturnType<typeof buildStatement>): string =>
  JSON.stringify(statement).replace(/[\u202f\u00a0]/g, ' ');

describe('buildStatement', () => {
  it('states a total conformity, with no non-conformity to list', () => {
    const statement = text(buildStatement(input()));

    expect(statement).toContain(
      'Site de la mairie est totalement conforme avec le référentiel général d’amélioration de l’accessibilité (RGAA), version 4.1.2.',
    );
    expect(statement).toContain('L’audit de conformité réalisé par Société Audit révèle que :');
    expect(statement).toContain('100 % des critères RGAA sont respectés.');
    expect(statement).toContain('Aucune non-conformité.');
    expect(statement).toContain('Cette déclaration a été établie le 15 octobre 2026.');
  });

  it('marks what the person has to write, and quotes each line of a text', () => {
    const statement = buildStatement(input());
    const content = text(statement);

    expect(content).toContain(
      '[À compléter : formulaire de contact ou coordonnées du responsable]',
    );
    expect(content).toContain('[À compléter : technologies du site');
    const exemptions = statement.sections.find(
      ({ heading }) => heading === 'Contenus non soumis à l’obligation d’accessibilité',
    );
    expect(exemptions?.blocks).toEqual([
      { type: 'paragraph', text: 'Cartes interactives' },
      { type: 'paragraph', text: 'Vidéos d’archives' },
    ]);
  });

  it('links the plans that exist, and only them', () => {
    const [, , plans] = buildStatement(input()).intro;

    expect(plans).toEqual({
      type: 'list',
      items: [
        { text: 'Schéma pluriannuel de mise en accessibilité', href: 'https://exemple.fr/schema' },
      ],
    });
  });

  it('cites Rampe and its axe-core version as the tool when the person names none', () => {
    expect(text(buildStatement(input()))).toContain(
      'Rampe : pré-audit automatique avec axe-core 4.13.0, puis évaluation manuelle des critères du RGAA.',
    );
  });

  it('gives no state and no rate in a draft, and says how many evaluations remain', () => {
    const statement = buildStatement(
      input({
        conformity: {
          ...complete,
          evaluated: 200,
          complete: false,
          rate: null,
          averageRate: null,
          state: null,
        },
      }),
    );
    const content = text(statement);

    expect(statement.draft).toBe(true);
    expect(content).toContain('12 évaluations sur 212 restent à faire');
    expect(content).not.toMatch(/\b(totalement|partiellement|non) conforme\b/);
    expect(content).toContain('Les résultats seront donnés à la fin de l’audit.');
  });
});
