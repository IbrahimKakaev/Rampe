import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { CURRENT_REFERENTIAL } from '@rampe/rules';

import { analyzedPage, reportScan, verifiedSite } from './support/fixtures.js';
import { type Client, type Harness, signedInAccount, startHarness } from './support/harness.js';

interface Row {
  criterion: string;
  automation: string;
  status: string | null;
  origin: string | null;
  proposal: string | null;
  proposalRules: { ruleId: string }[];
}

const CRITERIA = CURRENT_REFERENTIAL.criteria.map((criterion) => criterion.id);

describe('manual audit', () => {
  let harness: Harness;
  let client: Client;
  let org: string;
  let auditId: string;
  let home: string;
  let contact: string;

  const audit = () =>
    client
      .get(`/orgs/${org}/audits/${auditId}`)
      .expect(200)
      .then(
        (response) =>
          response.body as {
            pages: { id: string; url: string; evaluated: number; scanned: boolean }[];
            conformity: Record<string, unknown>;
          },
      );
  const grid = async (page: string): Promise<Row[]> =>
    (await client.get(`/orgs/${org}/audits/${auditId}/pages/${page}/criteria`).expect(200))
      .body as Row[];
  const evaluate = (
    page: string,
    criterion: string,
    status: string | null,
    note: string | null = null,
  ) =>
    client.put(`/orgs/${org}/audits/${auditId}/pages/${page}/criteria/${criterion}`, {
      status,
      note,
    });

  beforeAll(async () => {
    harness = await startHarness();
    ({ client, organizationId: org } = await signedInAccount(harness, 'auditrice@example.fr'));
    const siteId = await verifiedSite(harness, client, org, 'https://audit.example');
    const { id: scanId } = (await client.post(`/orgs/${org}/sites/${siteId}/scans`).expect(201))
      .body as { id: string };
    await reportScan(harness, scanId, [
      analyzedPage('https://audit.example/', [{ ruleId: 'image-alt', selector: 'img' }]),
      analyzedPage('https://audit.example/contact'),
    ]);
    auditId = (
      (await client.post(`/orgs/${org}/sites/${siteId}/audits`, { scanId }).expect(201)).body as {
        id: string;
      }
    ).id;
    const sampled = (
      await client
        .put(`/orgs/${org}/audits/${auditId}/pages`, {
          pages: [
            { url: 'https://audit.example/', title: 'Accueil' },
            { url: 'https://audit.example/contact', title: 'Contact' },
          ],
        })
        .expect(200)
    ).body as { pages: { id: string }[] };
    home = sampled.pages[0]?.id ?? '';
    contact = sampled.pages[1]?.id ?? '';
  });

  afterAll(async () => {
    await harness.close();
  });

  describe('automatic proposals, as in the table of PLAN.md §4.2', () => {
    it('sets « non conforme » for a defect linked to the criterion with certainty, as an automatic status', async () => {
      const row = (await grid(home)).find((candidate) => candidate.criterion === '1.1');

      expect(row).toMatchObject({
        status: 'NC',
        origin: 'AUTOMATIC',
        proposal: 'NON_COMPLIANT',
        proposalRules: [{ ruleId: 'image-alt' }],
      });
    });

    it('proposes « conforme » for the automatable criterion, without making it a status', async () => {
      const row = (await grid(contact)).find((candidate) => candidate.criterion === '8.5');

      expect(row).toMatchObject({
        automation: 'automatable',
        status: null,
        proposal: 'COMPLIANT_TO_CONFIRM',
      });
    });

    it('sets no criterion « conforme » without the auditor, and proposes nothing for the others', async () => {
      const rows = [...(await grid(home)), ...(await grid(contact))];

      expect(rows).toHaveLength(2 * CRITERIA.length);
      expect(rows.filter((row) => row.status === 'C')).toEqual([]);
      expect(
        rows.filter(
          (row) => row.proposal === 'COMPLIANT_TO_CONFIRM' && row.automation !== 'automatable',
        ),
      ).toEqual([]);
    });
  });

  describe('evaluations', () => {
    it('asks for a note before overturning a defect the robot found', async () => {
      const refused = await evaluate(home, '1.1', 'C').expect(400);
      expect((refused.body as { message: string }).message).toContain('expliquez dans la note');

      const accepted = await evaluate(
        home,
        '1.1',
        'C',
        'Image décorative, alternative vide correcte.',
      ).expect(200);
      expect(accepted.body).toMatchObject({
        status: 'C',
        origin: 'AUDITOR',
        note: 'Image décorative, alternative vide correcte.',
        author: 'auditrice',
      });
    });

    it('refuses an unknown criterion or status', async () => {
      await evaluate(home, '99.9', 'C').expect(404);
      await evaluate(home, '1.2', 'peut-être').expect(400);
    });

    it('keeps the evaluations of a page that stays in the sample', async () => {
      await client
        .put(`/orgs/${org}/audits/${auditId}/pages`, {
          pages: [
            { url: 'https://audit.example/contact', title: 'Nous contacter' },
            { url: 'https://audit.example/', title: 'Accueil' },
          ],
        })
        .expect(200);

      const { pages } = await audit();
      expect(pages.map(({ url }) => url)).toEqual([
        'https://audit.example/contact',
        'https://audit.example/',
      ]);
      expect((await grid(home)).find((row) => row.criterion === '1.1')?.status).toBe('C');
    });
  });

  describe('conformity rate, by the official method', () => {
    it('has no rate while one evaluation is missing, and says how many remain', async () => {
      const { conformity } = await audit();

      expect(conformity).toMatchObject({
        complete: false,
        expected: 2 * CRITERIA.length,
        rate: null,
        averageRate: null,
        state: null,
      });
      expect(conformity['evaluated']).toBeLessThan(2 * CRITERIA.length);
    });

    it('gives the rates of an example computed by hand once the audit is complete', async () => {
      // Every criterion not applicable, except:
      // - 1.1: conforme on both pages             → validated
      // - 3.2: non conforme on the home page       → invalidated
      // - 8.5: conforme on the contact page only   → validated
      // Rate: 2 validated / 3 applicable. Home: 1 C / 2 applicable = 1/2.
      // Contact: 2 C / 2 applicable = 1. Average: (1/2 + 1) / 2 = 3/4.
      const statuses: Record<string, Record<string, string>> = {
        [home]: { '1.1': 'C', '3.2': 'NC' },
        [contact]: { '1.1': 'C', '8.5': 'C' },
      };
      await harness.resetRateLimits();
      for (const page of [home, contact]) {
        for (const criterion of CRITERIA) {
          const status = statuses[page]?.[criterion] ?? 'NA';
          const note =
            criterion === '3.2' ? 'Texte gris clair du pied de page.' : 'Revu à la main.';
          await evaluate(page, criterion, status, note).expect(200);
        }
      }

      const conformity = (await client.get(`/orgs/${org}/audits/${auditId}/conformity`).expect(200))
        .body as Record<string, unknown>;
      expect(conformity).toEqual({
        evaluated: 2 * CRITERIA.length,
        expected: 2 * CRITERIA.length,
        complete: true,
        validated: 2,
        invalidated: 1,
        notApplicable: CRITERIA.length - 3,
        rate: 2 / 3,
        averageRate: 3 / 4,
        state: 'partial',
      });
    });
  });

  describe('accessibility statement', () => {
    it('is no longer a draft once the audit is complete, and gives the mandatory mentions', async () => {
      await client
        .put(`/orgs/${org}/audits/${auditId}/statement`, {
          entityName: 'Boulangerie Martin',
          serviceName: 'Site de la Boulangerie Martin',
          auditedBy: '',
          derogations: '',
          exemptions: '',
          technologies: 'HTML5, CSS',
          testEnvironment: 'Firefox et NVDA ; Safari et VoiceOver',
          tools: '',
          contactFormUrl: 'https://audit.example/contact',
          contactDetails: 'accessibilite@audit.example',
          multiYearPlanUrl: '',
          actionPlanUrl: '',
        })
        .expect(200);

      const statement = (await client.get(`/orgs/${org}/audits/${auditId}/statement`).expect(200))
        .body as {
        draft: boolean;
        title: string;
        sections: { heading: string; blocks: { text?: string; items?: { text: string }[] }[] }[];
      };
      // Intl writes a narrow no-break space before « % ».
      const text = JSON.stringify(statement).replace(/[\u202f\u00a0]/g, ' ');
      expect(statement.draft).toBe(false);
      expect(statement.title).toBe('Déclaration d’accessibilité');
      expect(statement.sections.map(({ heading }) => heading)).toEqual(
        expect.arrayContaining([
          'État de conformité',
          'Contenus non accessibles',
          'Environnement de test',
          'Retour d’information et contact',
          'Voies de recours',
        ]),
      );
      expect(text).toContain(
        'Site de la Boulangerie Martin est partiellement conforme avec le référentiel général d’amélioration de l’accessibilité (RGAA), version 4.1.2',
      );
      expect(text).toContain('66,7 % des critères RGAA sont respectés.');
      expect(text).toContain('Le taux moyen de conformité du service en ligne s’élève à 75 %.');
      expect(text).toContain('Critère 3.2');
      expect(text).toContain('Accueil : Texte gris clair du pied de page.');
      expect(text).toContain('Firefox et NVDA');
      expect(text).toContain('accessibilite@audit.example');
      expect(text).toContain('Écrire un message au Défenseur des droits');
      expect(text).toContain('Libre réponse 71120, 75342 Paris CEDEX 07');
    });

    it('is a draft, which states no conformity, while the audit is not complete', async () => {
      await evaluate(home, '12.6', null).expect(200);

      const statement = (await client.get(`/orgs/${org}/audits/${auditId}/statement`).expect(200))
        .body as { draft: boolean; title: string; intro: { text: string }[] };
      const text = JSON.stringify(statement);
      expect(statement.draft).toBe(true);
      expect(statement.title).toBe('Déclaration d’accessibilité — brouillon');
      expect(statement.intro[0]?.text).toContain(
        'Brouillon : l’audit n’est pas complet, 1 évaluation',
      );
      expect(text).not.toMatch(/\b(totalement|partiellement|non) conforme\b/);
      expect(text).toContain('Écrire un message au Défenseur des droits');
    });
  });

  it('publishes the referential and the classification of its 106 criteria, without a session', async () => {
    const anonymous = await harness.client();
    const referential = (await anonymous.get('/referentials/rgaa-4.1.2/criteria').expect(200))
      .body as { criteria: { id: string; automation: string }[]; criteriaToCheckManually: number };

    expect(referential.criteria).toHaveLength(106);
    expect(referential.criteriaToCheckManually).toBe(105);
    expect(referential.criteria.find(({ id }) => id === '8.5')?.automation).toBe('automatable');
  });
});
