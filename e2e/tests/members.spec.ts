import { type Browser, expect, type Page, test } from '@playwright/test';
import { webPath } from '@rampe/shared';

import { expectNoAccessibilityViolations } from './accessibility.js';
import { linkFromMailpit, session, tokenFromMailpit } from './support/api.js';

/**
 * The members of an organisation, through the application started by Docker
 * Compose: an owner invites a colleague by e-mail, who joins; the owner then
 * changes their role and removes them.
 */

const PASSWORD = 'une phrase de passe solide';

/** A verified account, signed in in its own browser context. */
async function account(browser: Browser, email: string, organizationName: string): Promise<Page> {
  const { send } = await session();
  await send('post', '/auth/register', {
    email,
    password: PASSWORD,
    name: email.split('@')[0],
    organizationName,
  });
  await send('post', '/auth/verify-email', { token: await tokenFromMailpit(email) });
  const page = await (await browser.newContext()).newPage();
  await page.goto(webPath('login'));
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Sites de ${organizationName}`);
  return page;
}

test('an owner invites a colleague, who joins; the owner changes their role, then removes them', async ({
  browser,
}) => {
  test.setTimeout(2 * 60_000);
  const stamp = String(Date.now());
  const ownerEmail = `proprietaire-${stamp}@example.fr`;
  const colleagueEmail = `collegue-${stamp}@example.fr`;
  const organization = `Agence ${stamp}`;

  const owner = await account(browser, ownerEmail, organization);
  await owner.getByRole('link', { name: 'Membres' }).click();
  await expect(owner.getByRole('heading', { level: 1 })).toHaveText(`Membres de ${organization}`);
  await owner.getByLabel('Adresse e-mail').fill(colleagueEmail);
  await owner.getByRole('button', { name: 'Envoyer l’invitation' }).click();
  const pending = owner.getByRole('table', { name: /Les invitations envoyées/ });
  await expect(pending).toContainText(colleagueEmail);
  await expectNoAccessibilityViolations(owner);

  // The colleague has an account of their own, and opens the link of the invitation.
  const colleague = await account(browser, colleagueEmail, `Indépendant ${stamp}`);
  await colleague.goto(await linkFromMailpit(colleagueEmail, '/invitations'));
  await colleague.getByRole('button', { name: 'Rejoindre l’organisation' }).click();
  await expect(colleague.getByRole('heading', { level: 1 })).toHaveText(`Sites de ${organization}`);

  await owner.reload();
  const members = owner.getByRole('table', { name: 'Les membres de l’organisation' });
  const row = members.getByRole('row').filter({ hasText: colleagueEmail });
  await expect(row).toContainText('collegue');
  await expect(owner.getByText('Aucune invitation en attente.')).toBeVisible();

  await row.getByRole('combobox', { name: /^Rôle de collegue/ }).selectOption('OWNER');
  await row.getByRole('button', { name: /Changer le rôle de collegue/ }).click();
  await expect(row.getByRole('combobox', { name: /^Rôle de collegue/ })).toHaveValue('OWNER');

  await row.getByRole('button', { name: /Retirer collegue/ }).click();
  await expect(members.getByRole('row').filter({ hasText: colleagueEmail })).toHaveCount(0);
});

test('an owner cannot leave an organisation without another owner', async ({ browser }) => {
  const stamp = String(Date.now());
  const email = `seul-${stamp}@example.fr`;
  const owner = await account(browser, email, `Solo ${stamp}`);
  await owner.getByRole('link', { name: 'Membres' }).click();

  await owner.getByRole('button', { name: /Retirer seul/ }).click();

  await expect(owner.getByRole('alert')).toContainText(
    'L’organisation doit garder au moins un propriétaire.',
  );
});
