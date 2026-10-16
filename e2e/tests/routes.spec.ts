import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { WEB_ROUTES, type WebRoute, webPath } from '@rampe/shared';

import { expectNoAccessibilityViolations } from './accessibility.js';
import { demoCookies, type DemoIds, demoIds, newDemoAudit } from './support/api.js';

/**
 * Every page of the application, as the router declares it (WEB_ROUTES, which
 * a unit test of the web application ties to the router configuration), is
 * checked here: axe-core, the content security policy, and the honesty rules.
 */

interface Ids extends DemoIds {
  readonly audit: string;
  readonly auditPage: string;
}

interface Visit {
  /** Pages of an organisation need the demonstration account. */
  readonly signedIn: boolean;
  readonly url: (ids: Ids) => string;
  /**
   * A view of the manual audit, where « conforme » is a status the auditor
   * chose: the honesty rule on automated results does not apply there.
   */
  readonly manualAudit?: boolean;
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
  organization: { signedIn: true, url: ({ org }) => webPath('organization', { org }) },
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
  audit: {
    signedIn: true,
    manualAudit: true,
    url: ({ org, audit }) => webPath('audit', { org, audit }),
  },
  auditPage: {
    signedIn: true,
    manualAudit: true,
    url: ({ org, audit, auditPage }) => webPath('auditPage', { org, audit, page: auditPage }),
  },
  statement: {
    signedIn: true,
    manualAudit: true,
    url: ({ org, audit }) => webPath('statement', { org, audit }),
  },
  notFound: { signedIn: false, url: () => '/cette-page-n-existe-pas' },
};

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

let ids: Ids;

test.beforeAll(async () => {
  const demo = await demoIds();
  const audit = await newDemoAudit([{ path: '/', title: 'Accueil' }]);
  ids = { ...demo, audit: audit.audit, auditPage: audit.pages[0] ?? '' };
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

    if (visit.manualAudit !== true) {
      const text = await page.locator('body').innerText();
      expect(text).not.toMatch(/\b(non[\s-])?conformes?\b/i);
    }
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
