import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { isPublicAddress } from '../egress/address-policy.js';
import { createEgressProxy } from '../egress/egress-proxy.js';
import { createProxiedFetcher } from './http-fetcher.js';

/** Runs the fetcher through a real egress proxy, in which 127.0.0.1 stands for a public origin. */
describe('createProxiedFetcher', () => {
  const userAgents: string[] = [];
  const origin = createServer((request, response) => {
    userAgents.push(request.headers['user-agent'] ?? '');
    if (request.url === '/big.xml') {
      response.end('x'.repeat(5000));
    } else if (request.url === '/moved') {
      response.writeHead(301, { location: 'http://public.test/robots.txt' }).end();
    } else {
      response.end('User-agent: *\nDisallow: /prive/\n');
    }
  });
  let proxy: Server;
  let fetcher: ReturnType<typeof createProxiedFetcher>;

  const listen = (server: Server): Promise<number> =>
    new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        resolve((server.address() as AddressInfo).port);
      });
    });

  beforeAll(async () => {
    const originPort = await listen(origin);
    proxy = createEgressProxy({
      allowedPorts: new Set([80, 443]),
      allowedPrivateHosts: new Set(),
      isPublic: (address) => address === '127.0.0.1' || isPublicAddress(address),
      resolve: (hostname) =>
        Promise.resolve(
          (
            { 'public.test': ['127.0.0.1'], 'internal.test': ['10.0.0.1'] } as Record<
              string,
              string[]
            >
          )[hostname] ?? [],
        ),
      dial: (host) => ({ host, port: originPort }),
      idleTimeoutMs: 5000,
      log: () => undefined,
    });
    const proxyPort = await listen(proxy);
    fetcher = createProxiedFetcher({
      proxyUrl: `http://127.0.0.1:${String(proxyPort)}`,
      userAgent: 'RampeBot/1.0 (test)',
      timeoutMs: 5000,
    });
  });

  afterAll(async () => {
    await fetcher.close();
    await new Promise((resolve) => proxy.close(resolve));
    await new Promise((resolve) => origin.close(resolve));
  });

  it('fetches a resource through the proxy, with the robot user agent, following redirects', async () => {
    const answer = await fetcher.fetchText('http://public.test/moved', 10_000);

    expect(answer).toEqual({
      status: 200,
      url: 'http://public.test/robots.txt',
      body: 'User-agent: *\nDisallow: /prive/\n',
    });
    expect(userAgents.every((agent) => agent === 'RampeBot/1.0 (test)')).toBe(true);
  });

  it('treats a destination the proxy refuses as unreachable, not as an answer of the site', async () => {
    await expect(fetcher.fetchText('http://internal.test/robots.txt', 10_000)).resolves.toBeNull();
    await expect(
      fetcher.fetchText('http://169.254.169.254/robots.txt', 10_000),
    ).resolves.toBeNull();
  });

  it('gives up on a resource larger than the limit', async () => {
    await expect(fetcher.fetchText('http://public.test/big.xml', 1000)).resolves.toBeNull();
    await expect(fetcher.fetchText('http://public.test/big.xml', 10_000)).resolves.toMatchObject({
      status: 200,
    });
  });

  it('returns null when nothing answers', async () => {
    await expect(fetcher.fetchText('http://unknown.test/', 10_000)).resolves.toBeNull();
  });
});
