import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';

import { type Harness, signedInAccount, startHarness } from './support/harness.js';

describe('authentication', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.resetRateLimits();
  });

  const password = 'un mot de passe solide';

  it('registers an account with its organisation, verifies the address, and signs in', async () => {
    const client = await harness.client();

    await client
      .post('/auth/register', {
        email: 'Alice@Example.fr ',
        password,
        name: 'Alice',
        organizationName: 'Boulangerie Martin',
      })
      .expect(202, { status: 'accepted' });
    const mail = harness.mailer.sent.at(-1);
    expect(mail).toMatchObject({
      to: 'alice@example.fr',
      subject: 'Confirmez votre adresse e-mail',
    });
    expect(mail?.text).toContain('https://rampe.test/verifier-email?jeton=');

    await client.post('/auth/login', { email: 'alice@example.fr', password }).expect(403);
    await client
      .post('/auth/verify-email', { token: harness.mailer.lastToken('alice@example.fr') })
      .expect(204);
    const login = await client
      .post('/auth/login', { email: 'alice@example.fr', password })
      .expect(200);

    expect(login.body).toMatchObject({
      user: { email: 'alice@example.fr', name: 'Alice' },
      organizations: [{ name: 'Boulangerie Martin', role: 'OWNER' }],
    });
    const cookie = ([] as string[])
      .concat(login.headers['set-cookie'] ?? [])
      .find((value) => value.startsWith('rampe_session='));
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    await client.get('/auth/me').expect(200);
  });

  it('stores only hashes of passwords, sessions and tokens', async () => {
    await signedInAccount(harness, 'hashes@example.fr');
    const user = await harness.prisma.user.findUniqueOrThrow({
      where: { email: 'hashes@example.fr' },
      include: { sessions: true },
    });

    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.sessions[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('answers a registration the same way for a known address, and reminds its owner', async () => {
    await signedInAccount(harness, 'known@example.fr');
    const client = await harness.client();

    await client
      .post('/auth/register', {
        email: 'known@example.fr',
        password,
        name: 'Intrus',
        organizationName: 'Autre',
      })
      .expect(202, { status: 'accepted' });

    expect(harness.mailer.sent.at(-1)).toMatchObject({
      to: 'known@example.fr',
      subject: 'Vous avez déjà un compte Rampe',
    });
    expect(await harness.prisma.user.count({ where: { email: 'known@example.fr' } })).toBe(1);
  });

  it('refuses a wrong password and an unknown address with the same answer', async () => {
    await signedInAccount(harness, 'bob@example.fr');
    const client = await harness.client();

    const wrong = await client
      .post('/auth/login', { email: 'bob@example.fr', password: 'pas le bon mot de passe' })
      .expect(401);
    const unknown = await client
      .post('/auth/login', { email: 'nobody@example.fr', password })
      .expect(401);

    expect(wrong.body).toEqual(unknown.body);
  });

  it('refuses invalid input with a 400 that names the problem', async () => {
    const client = await harness.client();

    const response = await client
      .post('/auth/register', {
        email: 'pas-une-adresse',
        password: 'court',
        name: '',
        organizationName: 'X',
      })
      .expect(400);

    expect(JSON.stringify(response.body)).toContain('12 caractères');
    await client
      .post('/auth/register', {
        email: 'a@b.fr',
        password,
        name: 'A',
        organizationName: 'B',
        admin: true,
      })
      .expect(400);
  });

  it('signs out, and the session no longer works', async () => {
    const { client } = await signedInAccount(harness, 'carol@example.fr');

    await client.post('/auth/logout').expect(204);

    await client.get('/auth/me').expect(401);
  });

  it('resets a forgotten password: the link works once, and every session closes', async () => {
    const { client: oldBrowser } = await signedInAccount(harness, 'dave@example.fr');
    const client = await harness.client();

    await client.post('/auth/password/forgot', { email: 'dave@example.fr' }).expect(202);
    await client.post('/auth/password/forgot', { email: 'nobody@example.fr' }).expect(202);
    const token = harness.mailer.lastToken('dave@example.fr');
    await client
      .post('/auth/password/reset', { token, password: 'un nouveau mot de passe' })
      .expect(204);

    await oldBrowser.get('/auth/me').expect(401);
    await client
      .post('/auth/password/reset', { token, password: 'encore un autre mot de passe' })
      .expect(400);
    await client.post('/auth/login', { email: 'dave@example.fr', password }).expect(401);
    await client
      .post('/auth/login', { email: 'dave@example.fr', password: 'un nouveau mot de passe' })
      .expect(200);
  });

  it('refuses a verification link used twice, or one of the wrong kind', async () => {
    const client = await harness.client();
    await client.post('/auth/register', {
      email: 'erin@example.fr',
      password,
      name: 'Erin',
      organizationName: 'E',
    });
    const token = harness.mailer.lastToken('erin@example.fr');

    await client.post('/auth/verify-email', { token }).expect(204);
    await client.post('/auth/verify-email', { token }).expect(400);
    await client
      .post('/auth/password/reset', { token, password: 'un nouveau mot de passe' })
      .expect(400);
  });

  it('slows down password guessing', async () => {
    await signedInAccount(harness, 'frank@example.fr');
    await harness.resetRateLimits();
    const client = await harness.client();

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      statuses.push(
        (
          await client.post('/auth/login', {
            email: 'frank@example.fr',
            password: 'mauvaise tentative',
          })
        ).status,
      );
    }

    expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });

  it('refuses a request that changes something without the CSRF token', async () => {
    const { client } = await signedInAccount(harness, 'grace@example.fr');
    // The client sends the token; a forged request from another site could not.
    await client.post('/auth/logout').set('x-xsrf-token', 'forged').expect(403);
    await client.get('/auth/me').expect(200);
  });

  it('sends the security headers', async () => {
    const client = await harness.client();

    const response = await client.get('/health');

    expect(response.headers).toMatchObject({
      'x-content-type-options': 'nosniff',
      'content-security-policy': expect.stringContaining("default-src 'self'"),
    });
    expect(response.headers).not.toHaveProperty('x-powered-by');
  });
});
