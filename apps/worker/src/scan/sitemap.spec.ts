import { describe, expect, it } from '@jest/globals';

import { parseSitemap } from './sitemap.js';

describe('parseSitemap', () => {
  it('lists the pages of a sitemap, decoding XML entities', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://www.example.fr/</loc><lastmod>2026-01-01</lastmod></url>
        <url><loc>
          https://www.example.fr/recherche?q=a&amp;page=2
        </loc></url>
        <url><loc><![CDATA[https://www.example.fr/caf&#xE9;]]></loc></url>
        <url><loc>https://www.example.fr/&#233;t&#xE9;</loc></url>
        <url><loc></loc></url>
      </urlset>`;

    expect(parseSitemap(xml)).toEqual({
      pages: [
        'https://www.example.fr/',
        'https://www.example.fr/recherche?q=a&page=2',
        'https://www.example.fr/caf&#xE9;',
        'https://www.example.fr/été',
      ],
      sitemaps: [],
    });
  });

  it('lists the sitemaps of a sitemap index', () => {
    const xml = `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap><loc>https://www.example.fr/sitemap-pages.xml</loc></sitemap>
        <sitemap><loc>https://www.example.fr/sitemap-produits.xml</loc></sitemap>
      </sitemapindex>`;

    expect(parseSitemap(xml)).toEqual({
      pages: [],
      sitemaps: [
        'https://www.example.fr/sitemap-pages.xml',
        'https://www.example.fr/sitemap-produits.xml',
      ],
    });
  });

  it('keeps unknown entities as they are and finds nothing in a page that is not a sitemap', () => {
    expect(
      parseSitemap('<urlset><url><loc>https://e.fr/&nbsp;</loc></url></urlset>').pages,
    ).toEqual(['https://e.fr/&nbsp;']);
    expect(parseSitemap('<!doctype html><html><body>Not found</body></html>')).toEqual({
      pages: [],
      sitemaps: [],
    });
  });
});
