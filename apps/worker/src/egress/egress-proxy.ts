import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type Server,
  type ServerResponse,
  STATUS_CODES,
} from 'node:http';
import { connect as netConnect, isIP } from 'node:net';
import type { Duplex } from 'node:stream';

import {
  hostHeader,
  parseForwardRequest,
  parseTunnelTarget,
  type Parsed,
  type ProxyTarget,
} from './target.js';

/** The rules the proxy enforces. */
export interface EgressPolicy {
  readonly allowedPorts: ReadonlySet<number>;
  /** Exact host names allowed to resolve to non-public addresses. Empty in production. */
  readonly allowedPrivateHosts: ReadonlySet<string>;
  readonly isPublic: (address: string) => boolean;
}

export interface EgressLogEntry {
  readonly event: 'allowed' | 'blocked' | 'failed';
  readonly method: string;
  readonly host?: string;
  readonly port?: number;
  readonly address?: string;
  readonly reason?: string;
}

export interface EgressProxyOptions extends EgressPolicy {
  /** Resolves a host name to every address it has. */
  readonly resolve: (hostname: string) => Promise<readonly string[]>;
  /**
   * Where to open the connection for an address the policy accepted. The
   * identity in production; tests use it to reach servers on local ports.
   */
  readonly dial?: (address: string, port: number) => { host: string; port: number };
  /** An upstream connection idle for longer than this is closed. */
  readonly idleTimeoutMs: number;
  readonly log: (entry: EgressLogEntry) => void;
}

export type EgressDecision =
  | { readonly allowed: true; readonly address: string }
  | { readonly allowed: false; readonly status: 403 | 502; readonly reason: string };

/**
 * Decides whether the proxy may connect to a target, and to which address.
 *
 * The host name is resolved once, here. Every address it resolves to must be
 * public, and the proxy then connects to the address it checked: a DNS answer
 * that changes in between (DNS rebinding) cannot redirect the connection.
 */
export async function authorize(
  target: ProxyTarget,
  policy: EgressPolicy & Pick<EgressProxyOptions, 'resolve'>,
): Promise<EgressDecision> {
  if (!policy.allowedPorts.has(target.port)) {
    return { allowed: false, status: 403, reason: `port ${String(target.port)} is not allowed` };
  }
  let addresses: readonly string[];
  if (isIP(target.hostname) === 0) {
    try {
      addresses = await policy.resolve(target.hostname);
    } catch {
      addresses = [];
    }
  } else {
    addresses = [target.hostname];
  }
  if (addresses.length === 0) {
    return { allowed: false, status: 502, reason: 'the host name does not resolve' };
  }
  if (!policy.allowedPrivateHosts.has(target.hostname)) {
    const refused = addresses.find((address) => !policy.isPublic(address));
    if (refused !== undefined) {
      return { allowed: false, status: 403, reason: `resolves to non-public address ${refused}` };
    }
  }
  // Docker networks seldom route IPv6 to the outside: prefer an IPv4 address.
  const address = addresses.find((candidate) => isIP(candidate) === 4) ?? addresses[0] ?? '';
  return { allowed: true, address };
}

/**
 * The only way out to the Internet for the scan engine. The browser and the
 * worker send every request through it; it refuses any destination that is not
 * an ordinary public address on port 80 or 443.
 *
 * Plain HTTP arrives as "GET http://host/path" and is forwarded. HTTPS and
 * WebSockets arrive as "CONNECT host:port" and are tunnelled without being
 * decrypted. Redirects need no special care: the browser sends each hop as a
 * new request, which is checked like the first.
 */
export function createEgressProxy(options: EgressProxyOptions): Server {
  const dial = options.dial ?? ((host: string, port: number) => ({ host, port }));

  const server = createServer((request, response) => {
    void forward(request, response);
  });
  server.on('connect', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    void tunnel(request, socket, head);
  });
  // WebSockets through a proxy use CONNECT; an upgrade on a plain request is not supported.
  server.on('upgrade', (request: IncomingMessage, socket: Duplex) => {
    options.log({
      event: 'blocked',
      method: request.method ?? '',
      reason: 'upgrade without CONNECT',
    });
    replyOnSocket(socket, 400, 'Use CONNECT to open a WebSocket through this proxy.');
  });
  server.on('clientError', (_error, socket) => {
    socket.destroy();
  });
  return server;

  async function forward(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const method = request.method ?? 'GET';
    const requestUrl = request.url ?? '';
    if (requestUrl.startsWith('/')) {
      // A request addressed to the proxy itself rather than through it.
      if (requestUrl === '/healthz') {
        reply(response, 200, 'ok');
      } else {
        reply(response, 400, 'This is a forward proxy: send absolute URLs.');
      }
      return;
    }
    const parsed = parseForwardRequest(requestUrl);
    if (!parsed.ok) {
      options.log({ event: 'blocked', method, reason: parsed.reason });
      reply(response, 400, BLOCKED_MESSAGE);
      return;
    }
    const { target, path } = parsed.value;
    const decision = await authorize(target, options);
    if (!decision.allowed) {
      options.log({ event: 'blocked', method, ...target, reason: decision.reason });
      reply(response, decision.status, BLOCKED_MESSAGE);
      return;
    }
    options.log({ event: 'allowed', method, ...target, address: decision.address });

    const destination = dial(decision.address, target.port);
    const upstream = httpRequest({
      host: destination.host,
      port: destination.port,
      method,
      path,
      headers: { ...withoutHopByHop(request.headers), host: hostHeader(target) },
      setHost: false,
      timeout: options.idleTimeoutMs,
    });
    upstream.on('response', (upstreamResponse) => {
      response.writeHead(
        upstreamResponse.statusCode ?? 502,
        upstreamResponse.statusMessage,
        withoutHopByHop(upstreamResponse.headers),
      );
      upstreamResponse.pipe(response);
    });
    upstream.on('timeout', () => {
      upstream.destroy(new Error('upstream idle timeout'));
    });
    // A client that gives up (a page time limit, a closed tab) releases the origin too.
    response.on('close', () => {
      if (!response.writableFinished) {
        upstream.destroy();
      }
    });
    upstream.on('error', (error) => {
      options.log({ event: 'failed', method, ...target, reason: error.message });
      if (response.headersSent) {
        response.destroy();
      } else {
        reply(response, 502, 'The origin server could not be reached.');
      }
    });
    request.pipe(upstream);
  }

  async function tunnel(request: IncomingMessage, client: Duplex, head: Buffer): Promise<void> {
    client.on('error', () => {
      client.destroy();
    });
    const parsed: Parsed<ProxyTarget> = parseTunnelTarget(request.url ?? '');
    if (!parsed.ok) {
      options.log({ event: 'blocked', method: 'CONNECT', reason: parsed.reason });
      replyOnSocket(client, 400, BLOCKED_MESSAGE);
      return;
    }
    const target = parsed.value;
    const decision = await authorize(target, options);
    if (!decision.allowed) {
      options.log({ event: 'blocked', method: 'CONNECT', ...target, reason: decision.reason });
      replyOnSocket(client, decision.status, BLOCKED_MESSAGE);
      return;
    }
    options.log({ event: 'allowed', method: 'CONNECT', ...target, address: decision.address });

    const destination = dial(decision.address, target.port);
    const upstream = netConnect({ host: destination.host, port: destination.port });
    let established = false;
    upstream.setTimeout(options.idleTimeoutMs, () => upstream.destroy());
    upstream.once('connect', () => {
      established = true;
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length > 0) {
        upstream.write(head);
      }
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.on('error', (error) => {
      options.log({ event: 'failed', method: 'CONNECT', ...target, reason: error.message });
      if (established) {
        client.destroy();
      } else {
        replyOnSocket(client, 502, 'The origin server could not be reached.');
      }
    });
    client.on('close', () => upstream.destroy());
  }
}

/**
 * What a refused request receives. The reason stays in the proxy's log: a
 * scanned page can read this answer, and must not learn anything about the
 * network the scanner runs in.
 */
const BLOCKED_MESSAGE = 'Blocked by the Rampe egress proxy.';

/** Headers that concern a single connection and must not be passed on (RFC 9110, section 7.6.1). */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function withoutHopByHop(headers: IncomingHttpHeaders): OutgoingHttpHeaders {
  const listed = new Set(
    (headers.connection ?? '')
      .split(',')
      .map((name) => name.trim().toLowerCase())
      .filter((name) => name !== ''),
  );
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !HOP_BY_HOP.has(name) && !listed.has(name)),
  );
}

/** Marks the answers the proxy gives itself, so that the scan can tell them from the site's. */
export const EGRESS_HEADER = 'x-rampe-egress';

function reply(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    [EGRESS_HEADER]: status === 403 ? 'blocked' : 'error',
  });
  response.end(body);
}

function replyOnSocket(socket: Duplex, status: number, body: string): void {
  socket.end(
    `HTTP/1.1 ${String(status)} ${STATUS_CODES[status] ?? ''}\r\n` +
      'Content-Type: text/plain; charset=utf-8\r\n' +
      `Content-Length: ${String(Buffer.byteLength(body))}\r\n` +
      'Connection: close\r\n\r\n' +
      body,
  );
}
