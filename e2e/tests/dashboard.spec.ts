import { expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from './accessibility.js';
import { demoCookies, linkFromMailpit } from './support/api.js';
import { publishVerificationToken } from './support/compose.js';
import { type Driver, keyboard, mouse } from './support/drivers.js';

/**
 * Acceptance tests of milestone J4: the dashboard, through the application
 * started by Docker Compose.
 */

const PASSWORD = 'une phrase de passe solide';
/** A second name of the test site, kept for these tests: a new account adds it as its site. */
const JOURNEY_HOST = 'fixture-site-e2e';

const heading = (page: Page) => page.getByRole('heading', { level: 1 });

/**
 * The whole journey of a new customer, from sign-up to the detail of a
 * defect. With the mouse, each step is also checked with axe-core, which
 * covers the states the route-by-route check cannot reach (a form just sent,
 * a site not verified yet, a scan in progress).
 */
async function journey(page: Page, driver: Driver, checkEachStep: boolean): Promise<void> {
  const step = async (): Promise<void> => {
    if (checkEachStep) {
      await expectNoAccessibilityViolations(page);
    }
  };
  const email = `parcours-${String(Date.now())}@example.fr`;
  const organization = `Parcours ${driver.name}`;

  await page.goto('/');
  await driver.activate(page.getByRole('main').getByRole('link', { name: 'Créer un compte' }));
  await expect(heading(page)).toHaveText('Créer un compte');
  await expect(heading(page)).toBeFocused();
  await step();
  await driver.fill(page.getByLabel('Votre nom'), 'Camille Martin');
  await driver.fill(page.getByLabel('Nom de votre organisation'), organization);
  await driver.fill(page.getByLabel('Adresse e-mail'), email);
  await driver.fill(page.getByLabel('Mot de passe'), PASSWORD);
  await driver.activate(page.getByRole('button', { name: 'Créer mon compte' }));
  await expect(
    page.getByRole('heading', { name: 'Vérifiez votre boîte de réception' }),
  ).toBeFocused();
  await step();

  // The person opens the link of the e-mail Mailpit received.
  await page.goto(await linkFromMailpit(email, '/verifier-email'));
  await expect(page.getByText('Votre adresse est confirmée.')).toBeVisible();
  await step();
  await driver.activate(page.getByRole('main').getByRole('link', { name: 'Se connecter' }));
  await expect(heading(page)).toHaveText('Se connecter');
  await expect(heading(page)).toBeFocused();
  await driver.fill(page.getByLabel('Adresse e-mail'), email);
  await driver.fill(page.getByLabel('Mot de passe'), PASSWORD);
  await driver.activate(page.getByRole('button', { name: 'Se connecter' }));

  await expect(heading(page)).toHaveText(`Sites de ${organization}`);
  await expect(heading(page)).toBeFocused();
  await expect(page.getByText('Aucun site pour l’instant.')).toBeVisible();
  await step();
  await driver.activate(page.getByRole('link', { name: 'Ajouter un site' }));
  await expect(heading(page)).toHaveText('Ajouter un site');
  await expect(heading(page)).toBeFocused();
  await step();
  await driver.fill(page.getByLabel(/Adresse de la page d’accueil/), `http://${JOURNEY_HOST}/`);
  await driver.activate(page.getByRole('button', { name: 'Continuer' }));

  await expect(heading(page)).toHaveText('Prouver que le site vous appartient');
  await expect(heading(page)).toBeFocused();
  await expect(page.locator('[aria-current="step"]')).toHaveText('Preuve de propriété');
  await step();
  // Without the file in place, the check fails and says why.
  await driver.activate(page.getByRole('button', { name: 'Vérifier maintenant' }));
  await expect(page.getByRole('alert')).toContainText('ne contient pas le jeton attendu');
  await step();
  // The owner publishes the token shown on the page, then checks again.
  const token = (await page.locator('pre code').nth(1).textContent())?.trim() ?? '';
  await publishVerificationToken(JOURNEY_HOST, token);
  await driver.activate(page.getByRole('button', { name: 'Vérifier maintenant' }));
  await expect(page.getByRole('heading', { name: `${JOURNEY_HOST} est vérifié` })).toBeFocused();
  await expect(page.locator('[aria-current="step"]')).toHaveText('Premier scan');
  await step();
  await driver.activate(page.getByRole('button', { name: 'Lancer le premier scan' }));

  await expect(heading(page)).toHaveText('Résultats du scan');
  await expect(heading(page)).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Défauts détectés' })).toBeVisible({
    timeout: 4 * 60_000,
  });
  await expect(page.locator('[data-pre-audit-notice]')).toContainText(
    /\d+ critères RGAA restent à vérifier manuellement/,
  );
  await step();
  const group = page.getByRole('button', { name: /^1\.1 / });
  await driver.activate(group);
  await expect(group).toHaveAttribute('aria-expanded', 'true');
  await step();
  await driver.activate(page.getByRole('link', { name: 'Image sans alternative textuelle' }));

  await expect(heading(page)).toHaveText('Image sans alternative textuelle');
  await expect(heading(page)).toBeFocused();
  await expect(page.locator('pre code')).toContainText('<img');
  await expect(
    page.getByText(`http://${JOURNEY_HOST}/erreurs/image-sans-alternative.html`),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Comment corriger' })).toBeVisible();
  await expect(page.getByText(/Critère 1\.1/)).toBeVisible();
  await step();
}

test.describe('the journey of a new customer', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test('signs up, adds and verifies a site, scans it and reads the results, with the mouse', async ({
    page,
  }) => {
    await journey(page, mouse(), true);
  });

  test('does the same with the keyboard alone, the focus always visible', async ({ page }) => {
    await journey(page, keyboard(page), false);
  });
});

test.describe('the results of a scan, on the demonstration account', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies(await demoCookies());
    await page.goto('/tableau-de-bord');
    await expect(heading(page)).toHaveText(/^Sites de /);
  });

  test('the site list shows the last score and its trend, next to the pre-audit notice', async ({
    page,
  }) => {
    const row = page.getByRole('row').filter({ hasText: 'fixture-site' });

    await expect(row.locator('[data-score]')).toHaveText(/\d+\s%/);
    await expect(row).toContainText(/En hausse|En baisse|Stable|Pas encore de comparaison/);
    await expect(page.locator('[data-pre-audit-notice]')).toContainText('Pré-audit automatique.');
  });

  test('the chart of the score has a table with the same values', async ({ page }) => {
    await page.getByRole('link', { name: 'fixture-site' }).click();

    const chart = page.getByRole('img', { name: /Graphique en ligne/ });
    await expect(chart).toBeVisible();
    const points = await page.locator('figure.chart circle').count();
    const table = page.getByRole('table', { name: /Données du graphique/ });
    await expect(table.locator('tbody tr')).toHaveCount(points);
  });

  test('defects are grouped by RGAA criterion, by impact and by page', async ({ page }) => {
    await page.getByRole('link', { name: 'fixture-site' }).click();
    // The first scan of the demonstration covers the whole test site.
    await page
      .getByRole('table', { name: /Les scans de fixture-site/ })
      .getByRole('link')
      .last()
      .click();
    const groups = page.locator('.disclosure');

    await expect(groups.first()).toBeVisible();
    await expect(groups).toContainText(['1.1 ', '3.2 ', '6.2 ', '8.3 ', '8.5 ', '11.1 ']);

    await page.getByLabel('Gravité').check();
    await expect(page).toHaveURL(/groupe=gravite/);
    await expect(groups.first()).toContainText(/Critique|Grave|Modéré|Mineur/);

    await page.getByLabel('Page', { exact: true }).check();
    await expect(page).toHaveURL(/groupe=page/);
    await expect(groups.filter({ hasText: '/erreurs/lien-vide.html' })).toHaveCount(1);
  });
});
