import { type BrowserContext, expect, type Page, request, test } from '@playwright/test';
import { WEB_ROUTES, type WebRoute, webPath } from '@rampe/shared';

import { expectNoAccessibilityViolations } from './accessibility.js';
import { BASE_URL, demoCookies } from './support/api.js';

/**
 * Every page of the application, as the router declares it (WEB_ROUTES, which
 * a unit test of the web application ties to the router configuration), is
 * checked here: axe-core, the content security policy, and the honesty rules.
 */

interface DemoIds {
  readonly org: string;
  readonly site: string;
  readonly scan: string;
  readonly finding: string;
}

interface Visit {
  /** Pages of an organisation need the demonstration account. */
  readonly signedIn: boolean;
  readonly url: (ids: DemoIds) => string;
  /** Brings the page to the state worth checking, once loaded. */
  readonly prepare?: (page: Page) => Promise<void>;
}

const A_TOKEN = 'a'.repeat(43);

/** A Record over WebRoute: a page added to the router without a visit here does not compile. */
const VISITS: Readonly<Record<WebRoute, Visit>> = {
  home: {
    signedIn: false,
    url: () => webPath('home'),
    prepare: async (page) => {
      await expect(page.getByRole('region', { name: 'État du service' })).toContainText('en ligne');
    },
  },
  login: { signedIn: false, url: () => webPath('login') },
  register: { signedIn: false, url: () => webPath('register') },
  verifyEmail: {
    signedIn: false,
    url: () => `${webPath('verifyEmail')}?jeton=${A_TOKEN}`,
    prepare: async (page) => {
      await expect(page.getByRole('alert')).toBeVisible();
    },
  },
  forgotPassword: { signedIn: false, url: () => webPath('forgotPassword') },
  resetPassword: { signedIn: false, url: () => `${webPath('resetPassword')}?jeton=${A_TOKEN}` },
  acceptInvitation: {
    signedIn: true,
    url: () => `${webPath('acceptInvitation')}?jeton=${A_TOKEN}`,
  },
  robot: { signedIn: false, url: () => webPath('robot') },
  dashboard: { signedIn: true, url: () => webPath('dashboard') },
  sites: { signedIn: true, url: ({ org }) => webPath('sites', { org }) },
  newSite: { signedIn: true, url: ({ org }) => webPath('newSite', { org }) },
  site: {
    signedIn: true,
    url: ({ org, site }) => webPath('site', { org, site }),
    prepare: async (page) => {
      await expect(page.locator('figure.chart')).toBeVisible();
    },
  },
  siteVerification: {
    signedIn: true,
    url: ({ org, site }) => webPath('siteVerification', { org, site }),
  },
  scan: {
    signedIn: true,
    url: ({ org, scan }) => webPath('scan', { org, scan }),
    prepare: async (page) => {
      const group = page.locator('.disclosure').first();
      await group.click();
      await expect(page.locator('.findings a').first()).toBeVisible();
    },
  },
  finding: {
    signedIn: true,
    url: ({ org, scan, finding }) => webPath('finding', { org, scan, finding }),
  },
  notFound: { signedIn: false, url: () => '/cette-page-n-existe-pas' },
};

/** Identifiers of the demonstration data: its site, and a scan with defects. */
async function demoIds(): Promise<DemoIds> {
  const context = await request.newContext({
    baseURL: BASE_URL,
    storageState: { cookies: await demoCookies(), origins: [] },
  });
  const get = async <T>(path: string): Promise<T> =>
    (await (await context.get(`/api/v1${path}`)).json()) as T;
  const [organization] = await get<{ id: string }[]>('/orgs');
  const org = organization?.id ?? '';
  const sites = await get<{ id: string; host: string }[]>(`/orgs/${org}/sites`);
  const site = sites.find(({ host }) => host === 'fixture-site')?.id ?? '';
  for (const { id } of await get<{ id: string }[]>(`/orgs/${org}/sites/${site}/scans`)) {
    const findings = await get<{ items: { id: string }[] }>(
      `/orgs/${org}/scans/${id}/findings?limit=1`,
    );
    const [finding] = findings.items;
    if (finding !== undefined) {
      return { org, site, scan: id, finding: finding.id };
    }
  }
  throw new Error('The demonstration has no scan with defects');
}

/** Content security policy violations reported by the browser while on the page. */
function watchPolicyViolations(page: Page): string[] {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('Content Security Policy')) {
      violations.push(message.text());
    }
  });
  return violations;
}

let ids: DemoIds;

test.beforeAll(async () => {
  ids = await demoIds();
});

test('every page of the router is visited', () => {
  expect(Object.keys(VISITS).sort()).toEqual(Object.keys(WEB_ROUTES).sort());
});

for (const [route, visit] of Object.entries(VISITS) as [WebRoute, Visit][]) {
  test(`page « ${route} »: no accessibility violation, strict content policy, honest wording`, async ({
    browser,
  }) => {
    const context: BrowserContext = await browser.newContext();
    if (visit.signedIn) {
      await context.addCookies(await demoCookies());
    }
    const page = await context.newPage();
    const violations = watchPolicyViolations(page);

    const response = await page.goto(visit.url(ids));
    expect(response?.headers()['content-security-policy']).toContain("style-src 'self'");
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/^Chargement/)).toHaveCount(0);
    await visit.prepare?.(page);

    await expectNoAccessibilityViolations(page);

    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/\b(non[\s-])?conformes?\b/i);
    if ((await page.locator('[data-score]').count()) > 0) {
      const notice = page.locator('[data-pre-audit-notice]');
      await expect(notice).toContainText('Pré-audit automatique.');
      await expect(notice).toContainText(/\d+ critères RGAA restent à vérifier manuellement/);
    }
    expect(violations).toEqual([]);
    await context.close();
  });
}

test('would catch an inline style, which the content policy refuses', async ({ page }) => {
  const violations = watchPolicyViolations(page);
  await page.goto(webPath('robot'));
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = 'body { color: red; }';
    document.head.append(style);
  });

  // Guards against a policy check that passes because it no longer sees anything.
  await expect.poll(() => violations.length).toBeGreaterThan(0);
  expect(await page.evaluate(() => getComputedStyle(document.body).color)).not.toBe(
    'rgb(255, 0, 0)',
  );
});
