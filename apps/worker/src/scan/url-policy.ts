/** Ports the egress proxy lets through; the URL parser writes a scheme's default port as "". */
const ALLOWED_PORTS = new Set(['', '80', '443']);

/** Files that are not web pages: the crawler does not spend its page budget on them. */
const NON_DOCUMENT_EXTENSIONS = new Set([
  '7z',
  'avi',
  'bmp',
  'css',
  'csv',
  'doc',
  'docx',
  'eot',
  'epub',
  'exe',
  'gif',
  'gz',
  'ico',
  'jpeg',
  'jpg',
  'js',
  'json',
  'm4a',
  'mov',
  'mp3',
  'mp4',
  'mpeg',
  'odp',
  'ods',
  'odt',
  'ogg',
  'otf',
  'pdf',
  'png',
  'ppt',
  'pptx',
  'rar',
  'rss',
  'svg',
  'tar',
  'tif',
  'tiff',
  'ttf',
  'txt',
  'wav',
  'webm',
  'webp',
  'woff',
  'woff2',
  'xls',
  'xlsx',
  'xml',
  'zip',
]);

/**
 * Turns a link into the URL of a page the crawler may visit, or `null`.
 *
 * Only http and https on ports 80 and 443, without credentials. The fragment is
 * dropped: "/a#b" and "/a" are the same page.
 */
export function toPageUrl(href: string, base?: string): URL | null {
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }
  if (url.username !== '' || url.password !== '' || !ALLOWED_PORTS.has(url.port)) {
    return null;
  }
  url.hash = '';
  return url;
}

/**
 * Whether a URL belongs to the scanned site: same scheme, host and port as the
 * site's address. Other subdomains are other sites, whose ownership has not
 * been verified.
 */
export function isOnSite(url: URL, site: URL): boolean {
  return url.origin === site.origin;
}

/** Whether the URL can point to a web page, judging by the extension of its path. */
export function mayBeDocument(url: URL): boolean {
  const lastSegment = url.pathname.slice(url.pathname.lastIndexOf('/') + 1);
  const dot = lastSegment.lastIndexOf('.');
  return dot === -1 || !NON_DOCUMENT_EXTENSIONS.has(lastSegment.slice(dot + 1).toLowerCase());
}
