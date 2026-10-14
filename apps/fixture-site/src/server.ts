import { readFile } from 'node:fs/promises';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

function send(response: ServerResponse, status: number, type: string, body: string | Buffer): void {
  response.writeHead(status, { 'content-type': type, 'content-length': Buffer.byteLength(body) });
  response.end(body);
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

/**
 * Static server for the test site. It is written by hand rather than delegated
 * to a generic web server because the scan engine tests need to control exactly
 * what the crawler is served.
 */
export function createFixtureServer(publicDir: string): Server {
  return createServer((request, response) => {
    void (async () => {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.setHeader('allow', 'GET, HEAD');
        send(response, 405, 'text/plain; charset=utf-8', 'Method Not Allowed');
        return;
      }
      const { pathname } = new URL(request.url ?? '/', 'http://fixture.invalid');
      const file = resolvePublicFile(publicDir, pathname);
      const type = file === null ? undefined : CONTENT_TYPES[extname(file)];
      if (file === null || type === undefined) {
        send(response, 404, 'text/plain; charset=utf-8', 'Not Found');
        return;
      }
      try {
        const body = await readFile(file);
        send(response, 200, type, request.method === 'HEAD' ? '' : body);
      } catch {
        send(response, 404, 'text/plain; charset=utf-8', 'Not Found');
      }
    })();
  });
}
