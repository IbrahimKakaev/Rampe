import { describe, expect, it } from '@jest/globals';

import type { RobotsPolicy } from './robots.js';
import { collectSitemapPages } from './scan.js';

const SITE = new URL('https://www.example.fr/');

function fetcherOf(documents: Record<string, string>) {
  const fetched: string[] = [];
  return {
    fetched,
    fetchText: (url: string) => {
      fetched.push(url);
      const body = documents[url];
      return Promise.resolve(
        body === undefined ? { status: 404, url, body: '' } : { status: 200, url, body },
      );
    },
  };
}

const robots = (sitemaps: string[] = [], disallowed = ''): RobotsPolicy => ({
  isAllowed: (url) => disallowed === '' || !url.pathname.startsWith(disallowed),
  crawlDelayMs: null,
  sitemaps,
  reachable: true,
});

describe('collectSitemapPages', () => {
  it('reads /sitemap.xml and the sitemaps of an index', async () => {
    const { fetchText } = fetcherOf({
      'https://www.example.fr/sitemap.xml':
        '<sitemapindex><sitemap><loc>https://www.example.fr/pages.xml</loc></sitemap></sitemapindex>',
      'https://www.example.fr/pages.xml':
        '<urlset><url><loc>https://www.example.fr/a</loc></url></urlset>',
    });

    await expect(
      collectSitemapPages(SITE, robots(), fetchText, () => Promise.resolve()),
    ).resolves.toEqual(['https://www.example.fr/a']);
  });

  it('reads the sitemaps robots.txt announces, but only those of the site', async () => {
    const { fetchText, fetched } = fetcherOf({
      'https://www.example.fr/plan.xml':
        '<urlset><url><loc>https://www.example.fr/b</loc></url></urlset>',
    });

    const pages = await collectSitemapPages(
      SITE,
      robots([
        'https://www.example.fr/plan.xml',
        'https://cdn.other.example/sitemap.xml',
        'not a url',
      ]),
      fetchText,
      () => Promise.resolve(),
    );

    expect(pages).toEqual(['https://www.example.fr/b']);
    expect(fetched).toEqual([
      'https://www.example.fr/sitemap.xml',
      'https://www.example.fr/plan.xml',
    ]);
  });

  it('waits for its turn before each request and reads each sitemap once', async () => {
    const { fetchText, fetched } = fetcherOf({
      'https://www.example.fr/sitemap.xml':
        '<sitemapindex><sitemap><loc>https://www.example.fr/sitemap.xml</loc></sitemap></sitemapindex>',
    });
    let turns = 0;

    await collectSitemapPages(
      SITE,
      robots(['https://www.example.fr/sitemap.xml']),
      fetchText,
      () => {
        turns += 1;
        return Promise.resolve();
      },
    );

    expect(fetched).toEqual(['https://www.example.fr/sitemap.xml']);
    expect(turns).toBe(1);
  });

  it('stops after five sitemap documents', async () => {
    const chain = Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [
        index === 0
          ? 'https://www.example.fr/sitemap.xml'
          : `https://www.example.fr/s${String(index)}.xml`,
        `<sitemapindex><sitemap><loc>https://www.example.fr/s${String(index + 1)}.xml</loc></sitemap></sitemapindex>`,
      ]),
    );
    const { fetchText, fetched } = fetcherOf(chain);

    await collectSitemapPages(SITE, robots(), fetchText, () => Promise.resolve());

    expect(fetched).toHaveLength(5);
  });

  it('respects robots.txt for the sitemaps themselves', async () => {
    const { fetchText, fetched } = fetcherOf({});

    await collectSitemapPages(SITE, robots([], '/'), fetchText, () => Promise.resolve());

    expect(fetched).toEqual([]);
  });

  it('ignores a sitemap that cannot be fetched', async () => {
    const pages = await collectSitemapPages(
      SITE,
      robots(),
      () => Promise.resolve(null),
      () => Promise.resolve(),
    );

    expect(pages).toEqual([]);
  });
});
