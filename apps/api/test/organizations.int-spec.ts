import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import { analyzedPage, reportScan, verifiedSite } from './support/fixtures.js';
import { type Harness, signedInAccount, startHarness } from './support/harness.js';

describe('organisations, members and invitations', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('lets an owner invite a person, who joins as a member once signed in with that address', async () => {
    const owner = await signedInAccount(harness, 'owner@example.fr');
    const carol = await signedInAccount(harness, 'carol@example.fr');
    const intruder = await signedInAccount(harness, 'intruder@example.fr');

    await owner.client
      .post(`/orgs/${owner.organizationId}/invitations`, {
        email: 'Carol@Example.fr',
        role: 'MEMBER',
      })
      .expect(201);
    const token = harness.mailer.lastToken('carol@example.fr');

    await intruder.client.post('/invitations/accept', { token }).expect(403);
    const joined = await carol.client.post('/invitations/accept', { token }).expect(200);
    expect(joined.body).toMatchObject({ id: owner.organizationId, role: 'MEMBER' });
    await carol.client.post('/invitations/accept', { token }).expect(400);

    const members = (await owner.client.get(`/orgs/${owner.organizationId}/members`).expect(200))
      .body as { email: string; role: string }[];
    expect(members.map(({ email, role }) => `${email}:${role}`)).toEqual([
      'owner@example.fr:OWNER',
      'carol@example.fr:MEMBER',
    ]);
    await owner.client
      .post(`/orgs/${owner.organizationId}/invitations`, {
        email: 'carol@example.fr',
        role: 'MEMBER',
      })
      .expect(409);
  });

  it('keeps the owner-only actions from members', async () => {
    const owner = await signedInAccount(harness, 'owner2@example.fr');
    const member = await signedInAccount(harness, 'member2@example.fr');
    await owner.client.post(`/orgs/${owner.organizationId}/invitations`, {
      email: 'member2@example.fr',
      role: 'MEMBER',
    });
    await member.client
      .post('/invitations/accept', { token: harness.mailer.lastToken('member2@example.fr') })
      .expect(200);
    const org = owner.organizationId;
    const siteId = await verifiedSite(harness, owner.client, org, 'https://roles.example');

    // A member works with the sites…
    await member.client.get(`/orgs/${org}/sites`).expect(200);
    await member.client.patch(`/orgs/${org}/sites/${siteId}`, { maxPages: 10 }).expect(200);
    // …but does not run the organisation.
    await member.client.patch(`/orgs/${org}`, { name: 'Prise de contrôle' }).expect(403);
    await member.client.delete(`/orgs/${org}`, { password: 'un mot de passe solide' }).expect(403);
    await member.client
      .post(`/orgs/${org}/invitations`, { email: 'x@example.fr', role: 'OWNER' })
      .expect(403);
    await member.client
      .patch(`/orgs/${org}/members/${member.userId}`, { role: 'OWNER' })
      .expect(403);
    await member.client.delete(`/orgs/${org}/sites/${siteId}`).expect(403);
  });

  it('always keeps one owner', async () => {
    const owner = await signedInAccount(harness, 'alone@example.fr');

    await owner.client
      .patch(`/orgs/${owner.organizationId}/members/${owner.userId}`, { role: 'MEMBER' })
      .expect(409);
    await owner.client.delete(`/orgs/${owner.organizationId}/members/${owner.userId}`).expect(409);
  });

  it('lets a person belong to several organisations', async () => {
    const agency = await signedInAccount(harness, 'agence@example.fr', 'Agence Web');

    await agency.client.post('/orgs', { name: 'Client : Boulangerie Martin' }).expect(201);

    const organizations = (await agency.client.get('/orgs').expect(200)).body as {
      name: string;
      role: string;
    }[];
    expect(organizations.map(({ name }) => name)).toEqual([
      'Agence Web',
      'Client : Boulangerie Martin',
    ]);
  });

  it('deletes an organisation and every row that belongs to it, after the owner’s password', async () => {
    const owner = await signedInAccount(harness, 'leaving@example.fr');
    const org = owner.organizationId;
    const siteId = await verifiedSite(harness, owner.client, org, 'https://leaving.example');
    const scan = (await owner.client.post(`/orgs/${org}/sites/${siteId}/scans`).expect(201))
      .body as { id: string };
    await reportScan(harness, scan.id, [
      analyzedPage('https://leaving.example/', [{ ruleId: 'image-alt', selector: 'img' }]),
    ]);
    await owner.client
      .post(`/orgs/${org}/invitations`, { email: 'someone@example.fr', role: 'MEMBER' })
      .expect(201);

    await owner.client.delete(`/orgs/${org}`, { password: 'pas le bon mot de passe' }).expect(403);
    await owner.client.delete(`/orgs/${org}`, { password: 'un mot de passe solide' }).expect(204);

    const tables = await harness.prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'organization_id'`;
    expect(tables.length).toBeGreaterThanOrEqual(6);
    for (const { table_name } of tables) {
      const [row] = await harness.prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT count(*) AS count FROM "${table_name}" WHERE organization_id = $1::uuid`,
        org,
      );
      expect({ table: table_name, rows: Number(row?.count) }).toEqual({
        table: table_name,
        rows: 0,
      });
    }
    expect(await harness.prisma.organization.count({ where: { id: org } })).toBe(0);
    // The account itself remains: it may belong to other organisations.
    await owner.client.get('/auth/me').expect(200);
  });
});
