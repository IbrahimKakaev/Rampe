import { readFile } from 'node:fs/promises';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';

import type { PublishedTokens } from './verification.js';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

/** Paths listed in the generated sitemap.xml. One of them is reachable by no link. */
export const SITEMAP_PATHS = ['/', '/page-propre.html', '/plan-du-site-seulement.html'] as const;

/** Where the redirect traps send the crawler. */
export const REDIRECTS: Readonly<Record<string, string>> = {
  // The cloud metadata endpoint: the egress proxy must refuse it.
  '/redirection-interne': 'http://169.254.169.254/latest/meta-data/',
  '/redirection-hors-site': 'http://www.example.com/',
};

/** One line of the request log, which the scan engine tests read to check the crawler's manners. */
export interface RequestLogEntry {
  readonly event: 'request';
  /** When the request arrived. */
  readonly time: string;
  readonly method: string;
  readonly path: string;
  readonly userAgent: string;
  /** 0 when the client went away before the answer was complete. */
  readonly status: number;
  readonly durationMs: number;
}

export interface FixtureServerOptions {
  readonly publicDir: string;
  /** How long /lent.html makes the client wait. Longer than the 30 s page limit by default. */
  readonly slowPageDelayMs?: number;
  readonly log?: (entry: RequestLogEntry) => void;
  readonly now?: () => Date;
  /** Served at /.well-known/rampe-verification.txt, per host, so that sites can be verified. */
  readonly verificationTokens?: PublishedTokens | undefined;
}

/** Maps a request path to a file under `root`, or `null` when it would escape it. */
export function resolvePublicFile(root: string, requestPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) {
    return null;
  }
  const absoluteRoot = resolve(root);
  const file = resolve(
    absoluteRoot,
    `.${decoded.endsWith('/') ? `${decoded}index.html` : decoded}`,
  );
  return file.startsWith(absoluteRoot + sep) ? file : null;
}

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/** The sitemap points to the host the client asked for, as a real site's would. */
export function buildSitemap(hostHeader: string | undefined): string {
  const host =
    hostHeader !== undefined && /^[a-z0-9.-]+(:\d{1,5})?$/i.test(hostHeader)
      ? hostHeader
      : 'localhost';
  const entries = SITEMAP_PATHS.map(
    (path) => `  <url><loc>${escapeXml(`http://${host}${path}`)}</loc></url>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n');
}

function send(
  response: ServerResponse,
  status: number,
  type: string,
  body: string | Buffer,
  head: boolean,
): void {
  response.writeHead(status, { 'content-type': type, 'content-length': Buffer.byteLength(body) });
  response.end(head ? '' : body);
}

/**
 * Server of the test site. It is written by hand rather than delegated to a
 * generic web server because the scan engine tests need to control exactly
 * what the crawler is served, and to read back what it asked for.
 */
export function createFixtureServer(options: FixtureServerOptions): Server {
  const slowPageDelayMs = options.slowPageDelayMs ?? 35_000;
  const log =
    options.log ??
    ((entry: RequestLogEntry) => {
      console.log(JSON.stringify(entry));
    });
  const now = options.now ?? (() => new Date());

  return createServer((request, response) => {
    const started = now();
    const { pathname, search } = new URL(request.url ?? '/', 'http://fixture.invalid');
    // 'close' fires once the exchange is over, answered or abandoned by the client.
    response.on('close', () => {
      log({
        event: 'request',
        time: started.toISOString(),
        method: request.method ?? '',
        path: `${pathname}${search}`,
        userAgent: request.headers['user-agent'] ?? '',
        status: response.writableFinished ? response.statusCode : 0,
        durationMs: now().getTime() - started.getTime(),
      });
    });

    void (async () => {
      const head = request.method === 'HEAD';
      if (request.method !== 'GET' && !head) {
        response.setHeader('allow', 'GET, HEAD');
        send(response, 405, 'text/plain; charset=utf-8', 'Method Not Allowed', false);
        return;
      }
      const verificationToken =
        pathname === '/.well-known/rampe-verification.txt'
          ? options.verificationTokens?.forHost(request.headers.host)
          : undefined;
      if (verificationToken !== undefined) {
        send(response, 200, 'text/plain; charset=utf-8', `${verificationToken}\n`, head);
        return;
      }
      if (pathname === '/__health') {
        send(response, 200, 'text/plain; charset=utf-8', 'ok', head);
        return;
      }
      const redirect = REDIRECTS[pathname];
      if (redirect !== undefined) {
        response.writeHead(302, { location: redirect, 'content-length': 0 });
        response.end();
        return;
      }
      if (pathname === '/sitemap.xml') {
        send(response, 200, CONTENT_TYPES['.xml'] ?? '', buildSitemap(request.headers.host), head);
        return;
      }
      if (pathname === '/lent.html') {
        await new Promise((resolveDelay) => {
          setTimeout(resolveDelay, slowPageDelayMs);
        });
        if (request.destroyed) {
          return;
        }
      }
      // The same address in several states, for the tests of defect fingerprints.
      const variant = /^\/variantes\/([a-z-]+)\.html$/.exec(pathname)?.[1];
      const state = new URLSearchParams(search).get('etat');
      const servedPath =
        variant !== undefined && state !== null && /^\d$/.test(state)
          ? `/variantes/${variant}-etat-${state}.html`
          : pathname;
      const file = resolvePublicFile(options.publicDir, servedPath);
      const type = file === null ? undefined : CONTENT_TYPES[extname(file)];
      if (file === null || type === undefined) {
        send(response, 404, 'text/plain; charset=utf-8', 'Not Found', head);
        return;
      }
      try {
        send(response, 200, type, await readFile(file), head);
      } catch {
        send(response, 404, 'text/plain; charset=utf-8', 'Not Found', head);
      }
    })();
  });
}
