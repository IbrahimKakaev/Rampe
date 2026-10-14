import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import {
  createServer as createHttpServer,
  request,
  type IncomingHttpHeaders,
  type Server,
} from 'node:http';
import {
  createServer as createTcpServer,
  type AddressInfo,
  type Server as TcpServer,
  type Socket,
} from 'node:net';

import { isPublicAddress } from './address-policy.js';
import { createEgressProxy, type EgressLogEntry, type EgressProxyOptions } from './egress-proxy.js';

/**
 * In these tests 127.0.0.1 stands for a public origin server: the policy is the
 * real one, except that it also accepts 127.0.0.1, where the test servers listen.
 * Ports 80 and 443 are dialled to the test servers' ports.
 */
const LOCAL_ORIGIN = '127.0.0.1';

interface SeenRequest {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: string;
}

function listen(server: Server | TcpServer): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve((server.address() as AddressInfo).port);
    });
  });
}

function close(server: Server | TcpServer): Promise<void> {
  return new Promise((resolve) =>
    server.close(() => {
      resolve();
    }),
  );
}

describe('egress proxy', () => {
  const seen: SeenRequest[] = [];
  const log: EgressLogEntry[] = [];
  const lookups: string[] = [];
  let rebindCount = 0;

  const origin = createHttpServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      seen.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
      res.writeHead(200, {
        'content-type': 'text/plain',
        connection: 'keep-alive, x-secret',
        'x-secret': 'hop',
      });
      res.end(`hello from ${req.headers.host ?? '?'}`);
    });
  });
  const echo = createTcpServer((socket) => socket.pipe(socket));
  let originPort = 0;
  let echoPort = 0;
  const proxies: Server[] = [];

  async function startProxy(overrides: Partial<EgressProxyOptions> = {}): Promise<number> {
    const proxy = createEgressProxy({
      allowedPorts: new Set([80, 443]),
      allowedPrivateHosts: new Set(),
      isPublic: (address) => address === LOCAL_ORIGIN || isPublicAddress(address),
      resolve: (hostname) => {
        lookups.push(hostname);
        const answers: Record<string, string[]> = {
          'public.test': [LOCAL_ORIGIN],
          'metadata.test': ['169.254.169.254'],
          'mixed.test': [LOCAL_ORIGIN, '10.0.0.1'],
          'internal.test': ['::1'],
          'fixture.test': [LOCAL_ORIGIN],
          'other.test': [LOCAL_ORIGIN],
        };
        if (hostname === 'rebind.test') {
          rebindCount += 1;
          return Promise.resolve(rebindCount === 1 ? [LOCAL_ORIGIN] : ['10.0.0.5']);
        }
        const answer = answers[hostname];
        return answer === undefined
          ? Promise.reject(new Error('ENOTFOUND'))
          : Promise.resolve(answer);
      },
      dial: (address, port) => ({ host: address, port: port === 443 ? echoPort : originPort }),
      idleTimeoutMs: 5000,
      log: (entry) => log.push(entry),
      ...overrides,
    });
    proxies.push(proxy);
    return listen(proxy);
  }

  let proxyPort = 0;

  beforeAll(async () => {
    [originPort, echoPort] = await Promise.all([listen(origin), listen(echo)]);
    proxyPort = await startProxy();
  });

  afterAll(async () => {
    await Promise.all([close(origin), close(echo), ...proxies.map(close)]);
  });

  beforeEach(() => {
    seen.length = 0;
    log.length = 0;
    lookups.length = 0;
  });

  function viaProxy(
    url: string,
    init: { method?: string; headers?: Record<string, string>; body?: string; port?: number } = {},
  ): Promise<{ status: number; body: string; headers: IncomingHttpHeaders }> {
    return new Promise((resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port: init.port ?? proxyPort,
          method: init.method ?? 'GET',
          path: url,
          headers: init.headers,
        },
        (res) => {
          let body = '';
          res.on('data', (chunk: Buffer) => (body += chunk.toString()));
          res.on('end', () => {
            resolve({ status: res.statusCode ?? 0, body, headers: res.headers });
          });
        },
      );
      req.on('error', reject);
      req.end(init.body);
    });
  }

  function connectVia(authority: string): Promise<{ status: number; socket: Socket }> {
    return new Promise((resolve, reject) => {
      const req = request({
        host: '127.0.0.1',
        port: proxyPort,
        method: 'CONNECT',
        path: authority,
      });
      req.on('connect', (res, socket: Socket) => {
        resolve({ status: res.statusCode ?? 0, socket });
      });
      req.on('response', (res) => {
        resolve({ status: res.statusCode ?? 0, socket: res.socket });
      });
      req.on('error', reject);
      req.end();
    });
  }

  describe('plain HTTP', () => {
    it('forwards the request to the address it checked, with the original Host', async () => {
      const response = await viaProxy('http://public.test/page?x=1', {
        headers: { host: 'public.test', 'proxy-connection': 'keep-alive', 'x-kept': 'yes' },
      });

      expect(response).toMatchObject({ status: 200, body: 'hello from public.test' });
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({ method: 'GET', url: '/page?x=1' });
      expect(seen[0]?.headers).toMatchObject({ host: 'public.test', 'x-kept': 'yes' });
      expect(seen[0]?.headers).not.toHaveProperty('proxy-connection');
      expect(log).toEqual([
        {
          event: 'allowed',
          method: 'GET',
          hostname: 'public.test',
          port: 80,
          address: LOCAL_ORIGIN,
        },
      ]);
    });

    it('forwards a request body and drops hop-by-hop response headers', async () => {
      const response = await viaProxy('http://public.test/form', { method: 'POST', body: 'a=1' });

      expect(seen[0]).toMatchObject({ method: 'POST', body: 'a=1' });
      expect(response.headers).not.toHaveProperty('x-secret');
    });

    it.each([
      ['a name that resolves to the metadata endpoint', 'http://metadata.test/latest/meta-data/'],
      ['a name with one private address among public ones', 'http://mixed.test/'],
      ['a name that resolves to IPv6 loopback', 'http://internal.test/'],
    ])('refuses %s, without telling the page why', async (_label, url) => {
      const response = await viaProxy(url);

      expect(response).toEqual(
        expect.objectContaining({ status: 403, body: 'Blocked by the Rampe egress proxy.' }),
      );
      expect(response.headers['x-rampe-egress']).toBe('blocked');
      expect(seen).toHaveLength(0);
      expect(log[0]).toMatchObject({
        event: 'blocked',
        reason: expect.stringContaining('non-public address'),
      });
    });

    it.each([
      'http://169.254.169.254/latest/meta-data/',
      'http://167772161/',
      'http://012.0.0.1/',
      'http://0xa000001/',
      'http://10.1/',
      'http://[::ffff:10.0.0.1]/',
      'http://[fe80::1]/',
      'http://[fd00::1]/',
      'http://0.0.0.0/',
    ])('refuses the address %s without resolving anything', async (url) => {
      const response = await viaProxy(url);

      expect(response.status).toBe(403);
      expect(lookups).toEqual([]);
      expect(seen).toHaveLength(0);
    });

    it.each(['http://public.test:8080/', 'http://public.test:22/', 'http://public.test:6379/'])(
      'refuses %s: only ports 80 and 443 are allowed',
      async (url) => {
        const response = await viaProxy(url);

        expect(response.status).toBe(403);
        expect(log[0]).toMatchObject({ reason: expect.stringContaining('port') });
        expect(seen).toHaveLength(0);
      },
    );

    it.each(['ftp://public.test/', 'https://public.test/', 'file:///etc/passwd'])(
      'refuses the scheme of %s',
      async (url) => {
        expect((await viaProxy(url)).status).toBe(400);
        expect(seen).toHaveLength(0);
      },
    );

    it('checks the address again on every request, so DNS rebinding gets nowhere', async () => {
      const first = await viaProxy('http://rebind.test/');
      const second = await viaProxy('http://rebind.test/');

      expect(first.status).toBe(200);
      expect(second.status).toBe(403);
      // One lookup per request, and the connection goes to the address that was checked.
      expect(lookups).toEqual(['rebind.test', 'rebind.test']);
      expect(seen).toHaveLength(1);
    });

    it('releases the origin server when the client gives up', async () => {
      let originClosed = false;
      const slow = createHttpServer((_req, res) => {
        res.on('close', () => {
          originClosed = true;
        });
      });
      const slowPort = await listen(slow);
      const port = await startProxy({ dial: (host) => ({ host, port: slowPort }) });

      await new Promise<void>((resolve) => {
        const req = request({ host: '127.0.0.1', port, path: 'http://public.test/slow' });
        req.on('error', () => {
          resolve();
        });
        req.end();
        setTimeout(() => {
          req.destroy();
          resolve();
        }, 100);
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
      await close(slow);

      expect(originClosed).toBe(true);
    });

    it('answers 502 for a name that does not resolve', async () => {
      expect((await viaProxy('http://unknown.test/')).status).toBe(502);
    });

    it('answers 502 when the origin server cannot be reached', async () => {
      const closedPort = await startProxy({ dial: (host) => ({ host, port: 1 }) });

      const response = await viaProxy('http://public.test/', { port: closedPort });

      expect(response.status).toBe(502);
      expect(log.some((entry) => entry.event === 'failed')).toBe(true);
    });
  });

  describe('private hosts allowed by configuration', () => {
    it('lets through only the host names on the list', async () => {
      const port = await startProxy({
        isPublic: isPublicAddress,
        allowedPrivateHosts: new Set(['fixture.test']),
      });

      expect((await viaProxy('http://fixture.test/', { port })).status).toBe(200);
      expect((await viaProxy('http://other.test/', { port })).status).toBe(403);
    });

    it('still applies the port rule to them', async () => {
      const port = await startProxy({
        isPublic: isPublicAddress,
        allowedPrivateHosts: new Set(['fixture.test']),
      });

      expect((await viaProxy('http://fixture.test:8080/', { port })).status).toBe(403);
    });
  });

  describe('CONNECT tunnels', () => {
    it('opens a tunnel to an allowed host on port 443', async () => {
      const { status, socket } = await connectVia('public.test:443');

      expect(status).toBe(200);
      const echoed = await new Promise<string>((resolve) => {
        socket.once('data', (data: Buffer) => {
          resolve(data.toString());
        });
        socket.write('ping');
      });
      socket.destroy();
      expect(echoed).toBe('ping');
    });

    it.each([
      ['a non-public destination', 'metadata.test:443', 403],
      ['an IP literal of a private network', '10.0.0.1:443', 403],
      ['a numeric form of a private address', '167772161:443', 403],
      ['a port other than 80 and 443', 'public.test:22', 403],
      ['a malformed target', 'user@public.test:443', 400],
    ])('refuses %s', async (_label, authority, status) => {
      const response = await connectVia(authority);
      response.socket.destroy();

      expect(response.status).toBe(status);
    });
  });

  describe('requests addressed to the proxy itself', () => {
    it('answers its health check and nothing else', async () => {
      expect(await viaProxy('/healthz')).toMatchObject({ status: 200, body: 'ok' });
      expect((await viaProxy('/anything')).status).toBe(400);
    });
  });
});
