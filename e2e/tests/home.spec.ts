import { expect, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from './accessibility.js';

test.describe('home page', () => {
  test('is served in French, with a title and a single main heading', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page).toHaveTitle("Rampe — pré-audit d'accessibilité RGAA");
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rampe');
  });

  test('shows that the API, the database and the job queue are up', async ({ page }) => {
    await page.goto('/');

    const status = page.getByRole('region', { name: 'État du service' });
    for (const dependency of ['API', 'Base de données', 'File de tâches']) {
      const row = status
        .locator('dl > div')
        .filter({ has: page.getByText(dependency, { exact: true }) });
      await expect(row.locator('dd')).toHaveText('en ligne');
    }
  });

  test('has no accessibility violation once its content is loaded', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'État du service' })).toContainText('en ligne');

    await expectNoAccessibilityViolations(page);
  });

  test('would be caught by the accessibility check if it had a violation', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('main').evaluate((main) => {
      main.append(document.createElement('img'));
    });

    // Guards against a check that passes because it no longer looks at anything.
    await expect(expectNoAccessibilityViolations(page)).rejects.toThrow(/image-alt/);
  });

  test('offers a visible skip link that moves keyboard focus to the content', async ({ page }) => {
    await page.goto('/');

    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: 'Aller au contenu' });
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeInViewport();

    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
    await expect(page).toHaveURL('/');
  });

  test('says that an automated test never proves conformity', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('contentinfo')).toContainText(
      'Un test automatique ne prouve jamais la conformité au RGAA',
    );
  });
});

test.describe('API behind the web server', () => {
  test('reports its health on the same origin as the interface', async ({ request }) => {
    const response = await request.get('/api/v1/health');

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok',
      checks: { database: 'up', queue: 'up' },
    });
    expect(response.headers()).not.toHaveProperty('x-powered-by');
  });

  test('publishes its OpenAPI description', async ({ request }) => {
    const response = await request.get('/api/v1/openapi.json');

    expect(response.status()).toBe(200);
    const document = (await response.json()) as { paths: Record<string, unknown> };
    expect(Object.keys(document.paths)).toContain('/api/v1/health');
  });
});
