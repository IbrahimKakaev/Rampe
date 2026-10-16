import { expect, type Page, test } from '@playwright/test';
import { webPath } from '@rampe/shared';

import { expectNoAccessibilityViolations } from './accessibility.js';
import { demoApi, demoCookies, demoIds, newDemoAudit } from './support/api.js';
import { tabTo } from './support/drivers.js';

/**
 * Acceptance tests of milestone J6 through the application started by Docker
 * Compose: the sample, the grid of the 106 criteria with the keyboard alone,
 * the conformity rates of an example computed by hand, and the statement.
 */

const heading = (page: Page) => page.getByRole('heading', { level: 1 });

test.beforeEach(async ({ page }) => {
  await page.context().addCookies(await demoCookies());
});

test.describe('the sample of a manual audit', () => {
  test('is composed from the pages of the scan, and each page opens its grid', async ({ page }) => {
    const ids = await demoIds();
    await page.goto(webPath('scan', { org: ids.org, scan: ids.scan }));
    await page
      .getByRole('button', { name: 'Démarrer un audit manuel à partir de ce scan' })
      .click();
    await expect(heading(page)).toHaveText('Audit manuel');
    await expect(page.getByText('L’échantillon est vide.')).toBeVisible();

    await page
      .getByLabel('Page', { exact: true })
      .selectOption({ label: '/ — Accueil — Site de test de Rampe' });
    await page.getByLabel('Nom de la page').first().fill('Accueil');
    await page.getByRole('button', { name: 'Ajouter à l’échantillon' }).first().click();
    await page.getByLabel('Adresse de la page').fill('http://fixture-site/mentions-legales.html');
    await page.getByLabel('Nom de la page').last().fill('Mentions légales');
    await page.getByRole('button', { name: 'Ajouter à l’échantillon' }).last().click();

    const sample = page.getByRole('table', { name: /Les pages de l’échantillon/ });
    await expect(sample.getByRole('row')).toHaveCount(3);
    await expect(sample).toContainText('Hors du scan : aucune proposition automatique.');
    await expect(page.locator('[data-audit-remaining]')).toContainText('212 évaluations');
    await expectNoAccessibilityViolations(page);

    await page.getByRole('link', { name: 'Évaluer Accueil' }).click();
    await expect(heading(page)).toHaveText('Grille RGAA : Accueil');
    await expect(page.getByText('0 critère évalué sur 106')).toBeVisible();
  });
});

test.describe('the grid of the 106 criteria', () => {
  test('is used with the keyboard alone: status, note and saving, the focus always visible', async ({
    page,
  }) => {
    const { org, audit, pages } = await newDemoAudit([{ path: '/', title: 'Accueil' }]);
    await page.goto(webPath('auditPage', { org, audit, page: pages[0] ?? '' }));
    await expect(heading(page)).toHaveText('Grille RGAA : Accueil');

    // Theme 8, then criterion 8.5, whose automated rule passed on this page.
    await tabTo(page, page.getByRole('button', { name: /^8\. Éléments obligatoires/ }));
    await page.keyboard.press('Enter');
    const form = page.getByRole('form', { name: /^Critère 8\.5/ });
    await expect(form).toContainText('Proposition du robot : conforme');
    await expect(form).toContainText('Statut actuel : non évalué');

    // In a group of radio buttons, Tab reaches the checked one and the arrows change it.
    await tabTo(page, form.getByRole('radio', { name: 'Non évalué' }));
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(form.getByRole('radio', { name: 'Conforme', exact: true })).toBeChecked();
    await tabTo(page, form.getByLabel('Note sur le critère 8.5'));
    await page.keyboard.type('Titre « Accueil — Site de test de Rampe » pertinent.');
    await tabTo(page, form.getByRole('button', { name: 'Enregistrer le critère 8.5' }));
    await page.keyboard.press('Enter');

    await expect(form.getByRole('status')).toHaveText('Critère 8.5 enregistré.');
    await expect(form).toContainText('Statut actuel : conforme, par Compte de démonstration');
    await expect(form).toContainText('Le robot avait proposé « conforme »');
    await expect(page.getByText('1 critère évalué sur 106')).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });
});

test.describe('the conformity rate', () => {
  test.describe.configure({ timeout: 3 * 60_000 });

  test('appears only once the audit is complete, and matches an example computed by hand', async ({
    page,
  }) => {
    const { org, audit, pages } = await newDemoAudit([
      { path: '/', title: 'Accueil' },
      { path: '/page-propre.html', title: 'Page propre' },
    ]);
    const [home = '', clean = ''] = pages;
    const { context, send } = await demoApi();
    const criteria = (
      (await (
        await context.get(`/api/v1/orgs/${org}/audits/${audit}/pages/${home}/criteria`)
      ).json()) as {
        criterion: string;
      }[]
    ).map(({ criterion }) => criterion);
    // Every criterion not applicable, except:
    // - 1.1 conforme on both pages, 3.2 non conforme on the home page,
    //   8.5 conforme on the clean page only.
    // Rate: 2 validated / 3 applicable = 66,7 %. Home page: 1/2; clean page: 2/2.
    // Average: (1/2 + 1) / 2 = 75 %.
    const statuses: Record<string, Record<string, string>> = {
      [home]: { '1.1': 'C', '3.2': 'NC' },
      [clean]: { '1.1': 'C', '8.5': 'C' },
    };
    for (const [index, pageId] of [home, clean].entries()) {
      for (const criterion of criteria) {
        // The last evaluation is left for later, to see the audit incomplete first.
        if (index === 1 && criterion === criteria.at(-1)) {
          continue;
        }
        const response = await send(
          'put',
          `/orgs/${org}/audits/${audit}/pages/${pageId}/criteria/${criterion}`,
          { status: statuses[pageId]?.[criterion] ?? 'NA', note: 'Vérifié à la main.' },
        );
        expect(response.status()).toBe(200);
      }
    }

    await page.goto(webPath('audit', { org, audit }));
    await expect(page.locator('[data-audit-remaining]')).toContainText('1 évaluation');
    await expect(page.getByText('Taux de conformité RGAA')).toHaveCount(0);

    await send(
      'put',
      `/orgs/${org}/audits/${audit}/pages/${clean}/criteria/${criteria.at(-1) ?? ''}`,
      { status: 'NA', note: null },
    );
    await page.reload();
    const figures = page.locator('.figures');
    await expect(
      figures.locator('div').filter({ hasText: 'Taux de conformité RGAA' }),
    ).toContainText(/66,7\s%/);
    await expect(figures.locator('div').filter({ hasText: 'Taux moyen des pages' })).toContainText(
      /75\s%/,
    );
    await expect(figures.locator('div').filter({ hasText: 'État de conformité' })).toContainText(
      'Partiellement conforme',
    );
    await expectNoAccessibilityViolations(page);
  });
});

test.describe('the accessibility statement', () => {
  test('is marked as a draft while the audit is not complete, with the mandatory mentions', async ({
    page,
  }) => {
    const { org, audit } = await newDemoAudit([{ path: '/', title: 'Accueil' }]);
    await page.goto(webPath('statement', { org, audit }));

    await expect(page.locator('[data-statement-draft]')).toContainText('Brouillon.');
    const statement = page.locator('article.statement');
    await expect(statement.getByRole('heading', { level: 3 })).toHaveText(
      'Déclaration d’accessibilité — brouillon',
    );
    for (const mention of [
      'État de conformité',
      'Contenus non accessibles',
      'Environnement de test',
      'Retour d’information et contact',
      'Voies de recours',
    ]) {
      await expect(statement.getByRole('heading', { name: mention, exact: true })).toBeVisible();
    }
    await expect(statement).toContainText('technologies d’assistance');
    await expect(
      statement.getByRole('link', { name: 'Écrire un message au Défenseur des droits' }),
    ).toHaveAttribute('href', 'https://www.defenseurdesdroits.fr/nous-contacter-355');
    // A draft states no conformity: the rate does not exist yet.
    await expect(statement).not.toContainText(/(totalement|partiellement|non) conforme/);

    await page.getByLabel('Coordonnées du responsable').fill('accessibilite@fixture-site.example');
    await page.getByLabel('Environnement de test').fill('Firefox et NVDA');
    await page.getByRole('button', { name: 'Enregistrer et mettre à jour la déclaration' }).click();
    await expect(page.getByText('Déclaration mise à jour.')).toBeVisible();
    await expect(statement).toContainText('accessibilite@fixture-site.example');
    await expect(statement).toContainText('Firefox et NVDA');
    await expectNoAccessibilityViolations(page);
  });
});
