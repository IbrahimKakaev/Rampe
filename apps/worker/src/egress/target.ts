/** Where a proxied request wants to go. */
export interface ProxyTarget {
  /** Host name or IP address, lower case, without IPv6 brackets or trailing dot. */
  readonly hostname: string;
  readonly port: number;
}

export type Parsed<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

export interface ForwardRequest {
  readonly target: ProxyTarget;
  /** Path and query string to send to the origin server. */
  readonly path: string;
}

/**
 * Parses the URL of a plain HTTP proxy request ("GET http://host/path").
 *
 * The WHATWG URL parser normalises the host the same way a browser does, so
 * that "http://2130706433/", "http://0x7f.1/" or "http://017700000001/" all
 * come out as 127.0.0.1 and meet the address policy under their real name.
 */
export function parseForwardRequest(requestUrl: string): Parsed<ForwardRequest> {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return refuse('the request target is not an absolute URL');
  }
  if (url.protocol !== 'http:') {
    return refuse(`the ${url.protocol} scheme is not allowed`);
  }
  if (url.username !== '' || url.password !== '') {
    return refuse('credentials in the URL are not allowed');
  }
  const target = toTarget(url);
  return target.ok
    ? { ok: true, value: { target: target.value, path: `${url.pathname}${url.search}` } }
    : target;
}

/** Parses the authority of a CONNECT request ("host:443"), used for HTTPS and WebSockets. */
export function parseTunnelTarget(authority: string): Parsed<ProxyTarget> {
  if (!/^(\[[0-9a-fA-F:.]+\]|[^\s/?#@[\]:]+):\d{1,5}$/.test(authority)) {
    return refuse('the CONNECT target must be host:port');
  }
  let url: URL;
  try {
    url = new URL(`http://${authority}`);
  } catch {
    return refuse('the CONNECT target is not a valid host');
  }
  return toTarget(url);
}

function toTarget(url: URL): Parsed<ProxyTarget> {
  const hostname = url.hostname
    .replace(/^\[(.*)\]$/, '$1')
    .replace(/\.$/, '')
    .toLowerCase();
  if (hostname === '') {
    return refuse('the target has no host');
  }
  // An empty port is the default one of the http: scheme used for parsing.
  const port = url.port === '' ? 80 : Number(url.port);
  return { ok: true, value: { hostname, port } };
}

function refuse(reason: string): { readonly ok: false; readonly reason: string } {
  return { ok: false, reason };
}

/** The Host header value for a target: IPv6 addresses take brackets, port 80 is implied. */
export function hostHeader({ hostname, port }: ProxyTarget): string {
  const host = hostname.includes(':') ? `[${hostname}]` : hostname;
  return port === 80 ? host : `${host}:${String(port)}`;
}
