import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { session, tokenFromMailpit } from './support/api.js';

/**
 * Acceptance tests of milestone J3, through the web server of the application
 * started by Docker Compose, as a browser would call the API.
 */

const manifest = JSON.parse(
  readFileSync(new URL('../../apps/fixture-site/defects.json', import.meta.url), 'utf8'),
) as {
  defects: { page: string; rule: string; expectedRgaaCriterion: string }[];
};

test.describe('accounts, through the real application', () => {
  test('sign-up, confirmation by e-mail received in Mailpit, sign-in, sign-out', async () => {
    const email = `e2e-${String(Date.now())}@example.fr`;
    const browser = await session();

    expect(
      (
        await browser.send('post', '/auth/register', {
          email,
          password: 'un mot de passe solide',
          name: 'E2E',
          organizationName: 'Organisation E2E',
        })
      ).status(),
    ).toBe(202);
    expect(
      (
        await browser.send('post', '/auth/verify-email', { token: await tokenFromMailpit(email) })
      ).status(),
    ).toBe(204);
    const login = await browser.send('post', '/auth/login', {
      email,
      password: 'un mot de passe solide',
    });
    expect(login.status()).toBe(200);
    expect(await login.json()).toMatchObject({
      user: { email },
      organizations: [{ name: 'Organisation E2E', role: 'OWNER' }],
    });

    expect((await browser.context.get('/api/v1/auth/me')).status()).toBe(200);
    expect((await browser.send('post', '/auth/logout')).status()).toBe(204);
    expect((await browser.context.get('/api/v1/auth/me')).status()).toBe(401);
  });

  test('password reset by e-mail', async () => {
    const email = `reset-${String(Date.now())}@example.fr`;
    const browser = await session();
    await browser.send('post', '/auth/register', {
      email,
      password: 'un mot de passe solide',
      name: 'R',
      organizationName: 'R',
    });
    await browser.send('post', '/auth/verify-email', { token: await tokenFromMailpit(email) });

    await browser.send('post', '/auth/password/forgot', { email });
    // The verification e-mail came first: wait for the reset one.
    let token = await tokenFromMailpit(email);
    for (
      let attempt = 0;
      attempt < 20 &&
      (
        await browser.send('post', '/auth/password/reset', {
          token,
          password: 'un autre mot de passe',
        })
      ).status() !== 204;
      attempt += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      token = await tokenFromMailpit(email);
    }

    expect(
      (
        await browser.send('post', '/auth/login', { email, password: 'un autre mot de passe' })
      ).status(),
    ).toBe(200);
  });
});

test.describe('the demonstration prepared by docker compose up', () => {
  test.describe.configure({ timeout: 3 * 60_000 });

  test('has its test site verified and scanned, with every planted error attached to its RGAA criterion', async () => {
    const demo = await session();
    expect(
      (
        await demo.send('post', '/auth/login', {
          email: 'demo@rampe.local',
          password: 'demo-local-only',
        })
      ).status(),
    ).toBe(200);
    const [organization] = (await (await demo.context.get('/api/v1/orgs')).json()) as {
      id: string;
    }[];
    const org = organization?.id ?? '';

    let site:
      | { id: string; verified: boolean; lastScan: { id: string; status: string } | null }
      | undefined;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      [site] = (await (
        await demo.context.get(`/api/v1/orgs/${org}/sites`)
      ).json()) as (typeof site & object)[];
      if (
        site?.lastScan !== null &&
        site?.lastScan.status !== 'QUEUED' &&
        site?.lastScan.status !== 'RUNNING'
      ) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    expect(site).toMatchObject({ verified: true, lastScan: { status: 'COMPLETED' } });
    // The scan docker compose up started is the oldest: later runs of these tests add others.
    const scans = (await (
      await demo.context.get(`/api/v1/orgs/${org}/sites/${site?.id ?? ''}/scans`)
    ).json()) as { id: string }[];
    const scanId = scans.at(-1)?.id ?? '';

    const scan = (await (
      await demo.context.get(`/api/v1/orgs/${org}/scans/${scanId}`)
    ).json()) as Record<string, unknown>;
    expect(scan).toMatchObject({
      pageCount: 15,
      criteriaToCheckManually: 105,
      referentialVersion: '4.1.2',
    });
    expect(scan['score']).toBeGreaterThan(0);

    const findings = (await (
      await demo.context.get(`/api/v1/orgs/${org}/scans/${scanId}/findings?limit=500`)
    ).json()) as {
      items: { ruleId: string; pagePath: string; rgaa: { criteria: string[] } }[];
    };
    expect(findings.items).toHaveLength(manifest.defects.length);
    for (const defect of manifest.defects) {
      expect(findings.items).toContainEqual(
        expect.objectContaining({
          ruleId: defect.rule,
          pagePath: defect.page,
          rgaa: expect.objectContaining({ criteria: [defect.expectedRgaaCriterion] }),
        }),
      );
    }
  });

  test('starts a new scan through the API, which the worker runs to the end', async () => {
    const demo = await session();
    await demo.send('post', '/auth/login', {
      email: 'demo@rampe.local',
      password: 'demo-local-only',
    });
    const [organization] = (await (await demo.context.get('/api/v1/orgs')).json()) as {
      id: string;
    }[];
    const org = organization?.id ?? '';
    const [site] = (await (await demo.context.get(`/api/v1/orgs/${org}/sites`)).json()) as {
      id: string;
    }[];
    await demo.send('patch', `/orgs/${org}/sites/${site?.id ?? ''}`, { maxPages: 3 });

    const started = await demo.send('post', `/orgs/${org}/sites/${site?.id ?? ''}/scans`);
    expect(started.status()).toBe(201);
    const { id } = (await started.json()) as { id: string };

    let scan: { status: string; pageCount: number | null; findingsAdded: number | null } = {
      status: 'QUEUED',
      pageCount: null,
      findingsAdded: null,
    };
    for (
      let attempt = 0;
      attempt < 40 && ['QUEUED', 'RUNNING'].includes(scan.status);
      attempt += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      scan = (await (
        await demo.context.get(`/api/v1/orgs/${org}/scans/${id}`)
      ).json()) as typeof scan;
    }
    expect(scan).toMatchObject({ status: 'COMPLETED', pageCount: 3 });
    // Compared with the first scan of the demo.
    expect(scan.findingsAdded).toBe(0);
    await demo.send('patch', `/orgs/${org}/sites/${site?.id ?? ''}`, { maxPages: 25 });
  });
});
