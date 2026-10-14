export interface SitemapContent {
  /** Pages listed by a sitemap. */
  readonly pages: readonly string[];
  /** Other sitemaps listed by a sitemap index. */
  readonly sitemaps: readonly string[];
}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeXmlText(raw: string): string {
  const text = raw.trim();
  // Inside a CDATA section, nothing is an entity.
  const cdata = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(text);
  if (cdata !== null) {
    return (cdata[1] ?? '').trim();
  }
  return text
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity: string, name: string) => {
      if (name.startsWith('#x') || name.startsWith('#X')) {
        return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
      }
      if (name.startsWith('#')) {
        return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
      }
      return ENTITIES[name.toLowerCase()] ?? entity;
    })
    .trim();
}

/**
 * Reads the <loc> entries of a sitemap (sitemaps.org protocol). A sitemap index
 * lists other sitemaps; a plain sitemap lists pages. The format is simple and
 * stable enough for a scan of the entries: no XML parser is needed.
 */
export function parseSitemap(xml: string): SitemapContent {
  const locations = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
    .map((match) => decodeXmlText(match[1] ?? ''))
    .filter((location) => location !== '');
  return /<sitemapindex[\s>]/i.test(xml)
    ? { pages: [], sitemaps: locations }
    : { pages: locations, sitemaps: [] };
}
