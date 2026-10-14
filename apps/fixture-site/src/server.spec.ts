import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildSitemap,
  createFixtureServer,
  type RequestLogEntry,
  resolvePublicFile,
} from './server.js';

describe('resolvePublicFile', () => {
  const root = '/srv/site';

  it('maps a path to a file under the root', () => {
    expect(resolvePublicFile(root, '/contact.html')).toBe('/srv/site/contact.html');
    expect(resolvePublicFile(root, '/a%20b.html')).toBe('/srv/site/a b.html');
  });

  it('serves index.html for a directory', () => {
    expect(resolvePublicFile(root, '/')).toBe('/srv/site/index.html');
    expect(resolvePublicFile(root, '/blog/')).toBe('/srv/site/blog/index.html');
  });

  it.each([
    '/../secret.txt',
    '/%2e%2e/secret.txt',
    '/blog/../../secret.txt',
    '/..%2f..%2fetc/passwd',
    '/%00.html',
    '/%E0%A4%A.html',
  ])('refuses %s', (path) => {
    expect(resolvePublicFile(root, path)).toBeNull();
  });

  it('refuses a sibling directory that shares the root as a prefix', () => {
    expect(resolvePublicFile(root, '/../site-private/a.html')).toBeNull();
  });
});

describe('buildSitemap', () => {
  it('lists the sitemap pages on the host the client asked for', () => {
    const sitemap = buildSitemap('fixture-site');

    expect(sitemap).toContain('<loc>http://fixture-site/</loc>');
    expect(sitemap).toContain('<loc>http://fixture-site/plan-du-site-seulement.html</loc>');
  });

  it.each([undefined, 'evil"><x>', 'a b'])('falls back to localhost for the host %j', (host) => {
    expect(buildSitemap(host)).toContain('<loc>http://localhost/</loc>');
  });
});

describe('createFixtureServer', () => {
  let directory: string;
  let server: Server;
  let origin: string;
  const requests: RequestLogEntry[] = [];

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'rampe-fixture-'));
    const publicDir = join(directory, 'public');
    await mkdir(join(publicDir, 'blog'), { recursive: true });
    await writeFile(join(publicDir, 'index.html'), '<!doctype html><title>Accueil</title>');
    await writeFile(join(publicDir, 'blog', 'index.html'), '<!doctype html><title>Blog</title>');
    await writeFile(join(publicDir, 'robots.txt'), 'User-agent: *\nAllow: /\n');
    await writeFile(join(publicDir, 'data.bin'), 'binary');
    await writeFile(join(directory, 'secret.txt'), 'top secret');
    await writeFile(join(publicDir, 'lent.html'), '<!doctype html><title>Lente</title>');

    server = createFixtureServer({
      publicDir,
      slowPageDelayMs: 300,
      log: (entry) => requests.push(entry),
      verificationToken: 'jeton-de-demonstration',
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true });
  });

  it('serves the home page as HTML', async () => {
    const response = await fetch(`${origin}/`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await response.text()).toContain('<title>Accueil</title>');
  });

  it('serves a directory index and a text file with their content types', async () => {
    const blog = await fetch(`${origin}/blog/?page=2`);
    const robots = await fetch(`${origin}/robots.txt`);

    expect(await blog.text()).toContain('<title>Blog</title>');
    expect(robots.headers.get('content-type')).toBe('text/plain; charset=utf-8');
  });

  it('answers HEAD without a body', async () => {
    const response = await fetch(`${origin}/`, { method: 'HEAD' });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it.each(['/missing.html', '/blog', '/data.bin'])('answers 404 for %s', async (path) => {
    expect((await fetch(`${origin}${path}`)).status).toBe(404);
  });

  it('never serves a file outside the public directory', async () => {
    // fetch() normalises "..", so the raw path is sent encoded.
    const response = await fetch(`${origin}/%2e%2e/secret.txt`);

    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('top secret');
  });

  it('logs each request with its path, user agent, status and duration', async () => {
    requests.length = 0;
    await fetch(`${origin}/robots.txt?x=1`, { headers: { 'user-agent': 'RampeBot/1.0' } });

    expect(requests).toEqual([
      expect.objectContaining({
        event: 'request',
        method: 'GET',
        path: '/robots.txt?x=1',
        userAgent: 'RampeBot/1.0',
        status: 200,
        durationMs: expect.any(Number),
      }),
    ]);
  });

  it('logs a request the client abandoned, with status 0', async () => {
    requests.length = 0;
    await fetch(`${origin}/lent.html`, { signal: AbortSignal.timeout(50) }).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(requests).toEqual([expect.objectContaining({ path: '/lent.html', status: 0 })]);
  });

  it('makes the slow page wait before answering', async () => {
    const started = Date.now();
    const response = await fetch(`${origin}/lent.html`);

    expect(response.status).toBe(200);
    expect(Date.now() - started).toBeGreaterThanOrEqual(290);
  });

  it.each([
    ['/redirection-interne', 'http://169.254.169.254/latest/meta-data/'],
    ['/redirection-hors-site', 'http://www.example.com/'],
  ])('redirects %s to %s', async (path, location) => {
    const response = await fetch(`${origin}${path}`, { redirect: 'manual' });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(location);
  });

  it('generates sitemap.xml for the requested host', async () => {
    const response = await fetch(`${origin}/sitemap.xml`);

    expect(response.headers.get('content-type')).toBe('application/xml; charset=utf-8');
    expect(await response.text()).toContain('<loc>http://127.0.0.1:');
  });

  it('serves a variant page in the state the query asks for, at the same path', async () => {
    const variants = join(directory, 'public', 'variantes');
    await mkdir(variants, { recursive: true });
    await writeFile(join(variants, 'image-etat-1.html'), '<!doctype html><title>Un</title>');
    await writeFile(join(variants, 'image-etat-2.html'), '<!doctype html><title>Deux</title>');

    expect(await (await fetch(`${origin}/variantes/image.html?etat=1`)).text()).toContain('Un');
    expect(await (await fetch(`${origin}/variantes/image.html?etat=2`)).text()).toContain('Deux');
    expect((await fetch(`${origin}/variantes/image.html?etat=9`)).status).toBe(404);
    expect((await fetch(`${origin}/variantes/image.html?etat=../../secret`)).status).toBe(404);
  });

  it('serves the ownership proof of the demo site', async () => {
    const response = await fetch(`${origin}/.well-known/rampe-verification.txt`);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('jeton-de-demonstration\n');
  });

  it('answers its health check on a path no page links to', async () => {
    expect(await (await fetch(`${origin}/__health`)).text()).toBe('ok');
  });

  it('refuses methods other than GET and HEAD', async () => {
    const response = await fetch(`${origin}/`, { method: 'POST' });

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD');
  });
});
