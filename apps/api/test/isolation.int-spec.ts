import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import { analyzedPage, reportScan, verifiedSite } from './support/fixtures.js';
import { type Client, type Harness, signedInAccount, startHarness } from './support/harness.js';

interface Operation {
  readonly method: 'get' | 'post' | 'patch' | 'delete';
  readonly path: string;
}

/** A valid body for each operation that needs one, so that validation is not what refuses the request. */
const BODIES: Readonly<Record<string, object>> = {
  'post /api/v1/orgs/{org}/sites': { url: 'https://isolation.example' },
  'patch /api/v1/orgs/{org}': { name: 'Renommée' },
  'delete /api/v1/orgs/{org}': { password: 'un mot de passe solide' },
  'patch /api/v1/orgs/{org}/members/{user}': { role: 'MEMBER' },
  'post /api/v1/orgs/{org}/invitations': { email: 'nouveau@example.fr', role: 'MEMBER' },
  'patch /api/v1/orgs/{org}/sites/{site}': { maxPages: 10 },
  'post /api/v1/orgs/{org}/sites/{site}/verification/check': { method: 'DNS' },
};

/**
 * Isolation between organisations, for every route of the API. The routes are
 * read from the OpenAPI description: a route added later is covered without
 * anyone thinking of it.
 */
describe('isolation between organisations', () => {
  let harness: Harness;
  let operations: Operation[];
  let bob: Client;
  let bobOrganization: string;
  const alice: Record<string, string> = {};

  beforeAll(async () => {
    harness = await startHarness();
    const a = await signedInAccount(harness, 'alice@example.fr');
    const b = await signedInAccount(harness, 'bob@example.fr');
    bob = b.client;
    bobOrganization = b.organizationId;

    alice['org'] = a.organizationId;
    alice['user'] = a.userId;
    alice['site'] = await verifiedSite(
      harness,
      a.client,
      a.organizationId,
      'https://www.alice.example',
    );
    alice['scan'] = (
      (await a.client.post(`/orgs/${a.organizationId}/sites/${alice['site']}/scans`).expect(201))
        .body as { id: string }
    ).id;
    await reportScan(harness, alice['scan'], [
      analyzedPage('https://www.alice.example/', [{ ruleId: 'image-alt', selector: 'img' }]),
    ]);
    const findings = (
      await a.client.get(`/orgs/${a.organizationId}/scans/${alice['scan']}/findings`).expect(200)
    ).body as { items: { id: string }[] };
    alice['finding'] = findings.items[0]?.id ?? '';
    alice['invitation'] = (
      (
        await a.client
          .post(`/orgs/${a.organizationId}/invitations`, {
            email: 'invite@example.fr',
            role: 'MEMBER',
          })
          .expect(201)
      ).body as { id: string }
    ).id;

    const document = (await bob.get('/openapi.json').expect(200)).body as {
      paths: Record<string, Record<string, unknown>>;
    };
    operations = Object.entries(document.paths).flatMap(([path, methods]) =>
      Object.keys(methods)
        .filter((method): method is Operation['method'] =>
          ['get', 'post', 'patch', 'delete'].includes(method),
        )
        .map((method) => ({ method, path })),
    );
  });

  afterAll(async () => {
    await harness.close();
  });

  const fill = (path: string, organization: string): string =>
    path.replace(/\{(\w+)\}/g, (_match, name: string) => {
      if (name === 'org') {
        return organization;
      }
      const value = alice[name];
      if (value === undefined) {
        throw new Error(
          `Unknown path parameter {${name}}: give the isolation test a resource of that kind`,
        );
      }
      return value;
    });

  const call = (operation: Operation, url: string) =>
    operation.method === 'get'
      ? bob.get(url.replace('/api/v1', ''))
      : bob[operation.method](
          url.replace('/api/v1', ''),
          BODIES[`${operation.method} ${operation.path}`],
        );

  it('reads every route from the OpenAPI description', () => {
    expect(
      operations.filter((operation) => operation.path.includes('{org}')).length,
    ).toBeGreaterThanOrEqual(20);
  });

  it('answers 404 to any request on another organisation, as if it did not exist', async () => {
    const leaks: string[] = [];
    for (const operation of operations.filter((candidate) => candidate.path.includes('{org}'))) {
      const response = await call(operation, fill(operation.path, alice['org'] ?? ''));
      if (response.status !== 404) {
        leaks.push(
          `${operation.method.toUpperCase()} ${operation.path}: ${String(response.status)}`,
        );
      }
    }

    expect(leaks).toEqual([]);
  });

  it('answers 404 to a request that names, under its own organisation, a resource of another', async () => {
    const leaks: string[] = [];
    const withResources = operations.filter((operation) => /\{org\}.*\{\w+\}/.test(operation.path));
    expect(withResources.length).toBeGreaterThanOrEqual(10);
    for (const operation of withResources) {
      const response = await call(operation, fill(operation.path, bobOrganization));
      if (response.status !== 404) {
        leaks.push(
          `${operation.method.toUpperCase()} ${operation.path}: ${String(response.status)}`,
        );
      }
    }

    expect(leaks).toEqual([]);
  });

  it('never shows the data of another organisation in a list', async () => {
    for (const path of [
      '/orgs',
      `/orgs/${bobOrganization}/sites`,
      `/orgs/${bobOrganization}/members`,
      `/orgs/${bobOrganization}/invitations`,
    ]) {
      const body = JSON.stringify((await bob.get(path).expect(200)).body);
      for (const id of Object.values(alice)) {
        expect(body).not.toContain(id);
      }
    }
  });

  it('left the other organisation’s data untouched', async () => {
    expect(await harness.prisma.organization.count({ where: { id: alice['org'] ?? '' } })).toBe(1);
    expect(
      await harness.prisma.site.findUniqueOrThrow({ where: { id: alice['site'] ?? '' } }),
    ).toMatchObject({ maxPages: 25 });
    expect(
      await harness.prisma.invitation.count({ where: { id: alice['invitation'] ?? '' } }),
    ).toBe(1);
  });
});
