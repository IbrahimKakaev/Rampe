import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { createControlServer, PublishedTokens } from './verification.js';

const TOKEN = 'a'.repeat(43);

describe('PublishedTokens', () => {
  it('serves the default token to any host until one is published for it', () => {
    const tokens = new PublishedTokens('jeton-de-demonstration');

    expect(tokens.forHost('fixture-site')).toBe('jeton-de-demonstration');
    expect(tokens.forHost(undefined)).toBe('jeton-de-demonstration');
  });

  it('serves the token published for a host, whatever the port and case of the Host header', () => {
    const tokens = new PublishedTokens('jeton-de-demonstration');

    expect(tokens.publish('fixture-site-e2e', TOKEN)).toBe(true);

    expect(tokens.forHost('Fixture-Site-E2E:80')).toBe(TOKEN);
    expect(tokens.forHost('fixture-site')).toBe('jeton-de-demonstration');
  });

  it('serves nothing without a default token or a published one', () => {
    expect(new PublishedTokens(undefined).forHost('fixture-site')).toBeUndefined();
  });

  it.each([
    ['a host with a slash', 'a/b', TOKEN],
    ['a token too short', 'fixture-site', 'court'],
    ['a token with spaces', 'fixture-site', `${'a'.repeat(40)} b c`],
  ])('refuses %s', (_label, host, token) => {
    expect(new PublishedTokens(undefined).publish(host, token)).toBe(false);
  });
});

describe('control server', () => {
  const tokens = new PublishedTokens(undefined);
  let server: Server;
  let origin: string;

  beforeAll(async () => {
    server = createControlServer(tokens);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('publishes the token sent for a host', async () => {
    const response = await fetch(`${origin}/verification-tokens/site-a`, {
      method: 'PUT',
      body: `${TOKEN}\n`,
    });

    expect(response.status).toBe(204);
    expect(tokens.forHost('site-a')).toBe(TOKEN);
  });

  it('refuses a malformed token', async () => {
    const response = await fetch(`${origin}/verification-tokens/site-b`, {
      method: 'PUT',
      body: 'pas un jeton',
    });

    expect(response.status).toBe(400);
    expect(tokens.forHost('site-b')).toBeUndefined();
  });

  it('answers nothing else', async () => {
    expect((await fetch(`${origin}/verification-tokens/site-a`)).status).toBe(404);
    expect((await fetch(`${origin}/`, { method: 'PUT', body: TOKEN })).status).toBe(404);
  });
});
