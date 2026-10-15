import { createServer, type Server } from 'node:http';

const HOST = /^[a-z0-9.-]{1,253}$/;
const TOKEN = /^[A-Za-z0-9_-]{32,128}$/;

/**
 * Ownership tokens the test site publishes at /.well-known/rampe-verification.txt,
 * per host name. The same server answers under several names, and each name is
 * a different site for Rampe, with its own token: the demonstration site uses
 * the default token, the end-to-end tests publish the token of the site they add.
 */
export class PublishedTokens {
  private readonly byHost = new Map<string, string>();

  constructor(private readonly fallback: string | undefined) {}

  /** The token served to a request whose Host header is `hostHeader`. */
  forHost(hostHeader: string | undefined): string | undefined {
    const host = (hostHeader ?? '').toLowerCase().replace(/:\d+$/, '');
    return this.byHost.get(host) ?? this.fallback;
  }

  /** Publishes `token` for `host`, as the owner of a site would. False if either is malformed. */
  publish(host: string, token: string): boolean {
    if (!HOST.test(host) || !TOKEN.test(token)) {
      return false;
    }
    this.byHost.set(host, token);
    return true;
  }
}

/**
 * The control server of the test site: `PUT /verification-tokens/<host>` with
 * the token as body. It must listen on the loopback interface only, so that it
 * is reachable from inside the container (`docker compose exec`) and from
 * nowhere else, the scanner included.
 */
export function createControlServer(tokens: PublishedTokens): Server {
  return createServer((request, response) => {
    const host = /^\/verification-tokens\/([^/]+)$/.exec(request.url ?? '')?.[1];
    if (request.method !== 'PUT' || host === undefined) {
      response.writeHead(404).end();
      return;
    }
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
      if (body.length > 256) {
        request.destroy();
      }
    });
    request.on('end', () => {
      response.writeHead(tokens.publish(host, body.trim()) ? 204 : 400).end();
    });
  });
}
