import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createFixtureServer, resolvePublicFile } from './server.js';

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

describe('createFixtureServer', () => {
  let directory: string;
  let server: Server;
  let origin: string;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'rampe-fixture-'));
    const publicDir = join(directory, 'public');
    await mkdir(join(publicDir, 'blog'), { recursive: true });
    await writeFile(join(publicDir, 'index.html'), '<!doctype html><title>Accueil</title>');
    await writeFile(join(publicDir, 'blog', 'index.html'), '<!doctype html><title>Blog</title>');
    await writeFile(join(publicDir, 'robots.txt'), 'User-agent: *\nAllow: /\n');
    await writeFile(join(publicDir, 'data.bin'), 'binary');
    await writeFile(join(directory, 'secret.txt'), 'top secret');

    server = createFixtureServer(publicDir);
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

  it('refuses methods other than GET and HEAD', async () => {
    const response = await fetch(`${origin}/`, { method: 'POST' });

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD');
  });
});
