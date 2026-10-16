import { readFileSync } from 'node:fs';

import { expect, request, test } from '@playwright/test';
import { webPath } from '@rampe/shared';

import { BASE_URL, demoCookies, demoIds, session, tokenFromMailpit } from './support/api.js';
import { readPdf } from './support/pdf.js';

/**
 * Acceptance tests of milestone J5 through the application started by Docker
 * Compose: the PDF report printed by the isolated browser, the scan schedule,
 * and the deletion of an organisation. The scheduler, the alerts and the purge
 * are tested with the clock moved forward, in apps/api/test/monitoring.int-spec.ts.
 */

const manifest = JSON.parse(
  readFileSync(new URL('../../apps/fixture-site/defects.json', import.meta.url), 'utf8'),
) as { defects: { page: string; rule: string; expectedRgaaCriterion: string }[] };

test.describe('the pre-audit report', () => {
  test.describe.configure({ timeout: 2 * 60_000 });

  test('is a tagged PDF in French with the cover, summary, defects by criterion, criteria to check by hand, date and scope', async () => {
    const ids = await demoIds();
    const api = await request.newContext({
      baseURL: BASE_URL,
      storageState: { cookies: await demoCookies(), origins: [] },
    });

    const response = await api.get(`/api/v1/orgs/${ids.org}/scans/${ids.scan}/report.pdf`);

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('application/pdf');
    const pdf = await readPdf(await response.body());
    // Tagged: a screen reader gets headings and tables, not a flat page of text.
    expect(pdf.marked).toBe(true);
    expect([...pdf.roles]).toEqual(expect.arrayContaining(['H1', 'H2', 'Table', 'TH']));
    expect(pdf.language).toBe('fr');
    for (const section of [
      'Rapport de pré-audit automatique d’accessibilité',
      'Synthèse',
      'Périmètre',
      'Défauts par critère RGAA',
      'Critères à vérifier manuellement',
      'Scan terminé le',
      'http://fixture-site/',
      '105 critères RGAA restent à vérifier manuellement',
    ]) {
      expect(pdf.text).toContain(section);
    }
    for (const criterion of new Set(
      manifest.defects.map((defect) => defect.expectedRgaaCriterion),
    )) {
      expect(pdf.text).toContain(`Critère ${criterion} :`);
    }
    // The report never concludes that the site is « conforme ».
    expect(pdf.text).not.toMatch(/\b(non[\s-])?conformes?\b/i);
  });

  test('is downloaded from the results of the scan', async ({ page }) => {
    const ids = await demoIds();
    await page.context().addCookies(await demoCookies());
    await page.goto(webPath('scan', { org: ids.org, scan: ids.scan }));

    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Télécharger le rapport de pré-audit (PDF)' }).click();

    expect((await download).suggestedFilename()).toMatch(
      /^pre-audit-fixture-site-\d{4}-\d{2}-\d{2}\.pdf$/,
    );
  });
});

test.describe('the scan schedule', () => {
  test('is chosen on the site page, which then says when the next scan comes', async ({ page }) => {
    const ids = await demoIds();
    await page.context().addCookies(await demoCookies());
    await page.goto(webPath('site', { org: ids.org, site: ids.site }));

    await page.getByLabel('Chaque semaine').check();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Réglages enregistrés.' }),
    ).toBeVisible();
    await expect(page.getByText(/Prochain scan automatique le \d+ \S+ \d{4}/)).toBeVisible();

    // Back to scans on demand, so that the demonstration stays as it was.
    await page.getByLabel('Aucun : seulement à la demande').check();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(
      page.getByText('Le robot ne repasse que quand vous lancez un scan.'),
    ).toBeVisible();
  });
});

test.describe('the deletion of an organisation', () => {
  test('is confirmed with the owner’s password, and leaves the person without it', async ({
    page,
  }) => {
    const email = `suppression-${String(Date.now())}@example.fr`;
    const { send } = await session();
    await send('post', '/auth/register', {
      email,
      password: 'une phrase de passe solide',
      name: 'Dominique',
      organizationName: 'Organisation éphémère',
    });
    await send('post', '/auth/verify-email', { token: await tokenFromMailpit(email) });

    await page.goto(webPath('login'));
    await page.getByLabel('Adresse e-mail').fill(email);
    await page.getByLabel('Mot de passe').fill('une phrase de passe solide');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await page.getByRole('link', { name: 'Paramètres de l’organisation' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Paramètres de l’organisation',
    );

    await page.getByLabel('Votre mot de passe, pour confirmer').fill('pas le bon');
    await page.getByRole('button', { name: /Supprimer définitivement/ }).click();
    await expect(page.getByRole('alert')).toContainText('Mot de passe incorrect.');

    await page.getByLabel('Votre mot de passe, pour confirmer').fill('une phrase de passe solide');
    await page.getByRole('button', { name: /Supprimer définitivement/ }).click();
    await expect(page).toHaveURL(/\/tableau-de-bord$/);
    await expect(page.getByText('Vous ne faites partie d’aucune organisation.')).toBeVisible();
  });
});
