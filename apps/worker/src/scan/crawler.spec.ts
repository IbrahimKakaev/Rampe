import { describe, expect, it } from '@jest/globals';
import { SCAN_DEFAULTS, type PageResult, type ScanLimits } from '@rampe/shared';

import { crawl, type CrawlDependencies, type PageToVisit } from './crawler.js';
import type { RobotsPolicy } from './robots.js';

const SITE = new URL('https://www.example.fr/');

/** A fake site: each path lists the links its page contains. */
const LINKS: Readonly<Record<string, readonly string[]>> = {
  '/': [
    '/a',
    '/b',
    '/a#section',
    '/prive/compte',
    '/guide.pdf',
    'https://other.example/',
    'https://shop.example.fr/',
    'mailto:contact@example.fr',
    'javascript:void(0)',
  ],
  '/a': ['/a/1', 'b'],
  '/a/1': ['/a/1/2'],
  '/a/1/2': ['/a/1/2/3'],
  '/a/1/2/3': ['/a/1/2/3/4'],
  '/b': ['/'],
  '/plan': [],
};

const allowAllButPrivate: RobotsPolicy = {
  isAllowed: (url) => !url.pathname.startsWith('/prive/'),
  crawlDelayMs: null,
  sitemaps: [],
  reachable: true,
};

function analyzed(url: string, depth: number): PageResult {
  return {
    status: 'analyzed',
    url,
    depth,
    httpStatus: 200,
    title: url,
    passed: [],
    incomplete: [],
    violations: [],
    truncated: false,
  };
}

function fakeBrowser(
  options: { delayMs?: (path: string) => number; redirect?: Record<string, string> } = {},
) {
  const visits: { path: string; depth: number; timeoutMs: number }[] = [];
  let active = 0;
  let maxActive = 0;
  let turns = 0;
  const deps: CrawlDependencies = {
    waitTurn: () => {
      turns += 1;
      return Promise.resolve();
    },
    analyze: async (page: PageToVisit, timeoutMs: number) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      visits.push({ path: page.url.pathname, depth: page.depth, timeoutMs });
      const delay = options.delayMs?.(page.url.pathname) ?? 0;
      await new Promise((resolve) => setTimeout(resolve, delay));
      active -= 1;
      const finalPath = options.redirect?.[page.url.pathname] ?? page.url.pathname;
      const finalUrl = new URL(finalPath, SITE).href;
      return { result: analyzed(finalUrl, page.depth), links: LINKS[finalPath] ?? [] };
    },
  };
  return {
    deps,
    visits,
    paths: () => visits.map((visit) => visit.path),
    maxActive: () => maxActive,
    turns: () => turns,
  };
}

const limits = (overrides: Partial<ScanLimits> = {}): ScanLimits => ({
  ...SCAN_DEFAULTS,
  ...overrides,
});

describe('crawl', () => {
  it('explores the site breadth first and stops at depth 3', async () => {
    const browser = fakeBrowser();

    const outcome = await crawl(
      { site: SITE, sitemapPages: [], robots: allowAllButPrivate, limits: limits() },
      browser.deps,
    );

    expect(browser.visits.map(({ path, depth }) => [path, depth])).toEqual([
      ['/', 0],
      ['/a', 1],
      ['/b', 1],
      ['/a/1', 2],
      ['/a/1/2', 3],
    ]);
    expect(outcome).toMatchObject({
      status: 'completed',
      reason: null,
      skipped: { disallowedByRobots: 1, beyondLimits: 1 },
    });
    expect(outcome.pages.map((page) => page.url)).toEqual([
      'https://www.example.fr/',
      'https://www.example.fr/a',
      'https://www.example.fr/b',
      'https://www.example.fr/a/1',
      'https://www.example.fr/a/1/2',
    ]);
  });

  it('never visits links of other sites, files, other schemes, or the same page twice', async () => {
    const browser = fakeBrowser();

    await crawl(
      { site: SITE, sitemapPages: [], robots: allowAllButPrivate, limits: limits() },
      browser.deps,
    );

    expect(browser.paths()).not.toContain('/guide.pdf');
    expect(new Set(browser.paths()).size).toBe(browser.paths().length);
  });

  it('starts from the sitemap pages too, at depth 1, but only those of the site', async () => {
    const browser = fakeBrowser();

    await crawl(
      {
        site: SITE,
        sitemapPages: [
          'https://www.example.fr/plan',
          'https://other.example/x',
          'not a url',
          'https://www.example.fr/prive/x',
        ],
        robots: allowAllButPrivate,
        limits: limits({ maxDepth: 1 }),
      },
      browser.deps,
    );

    expect(browser.visits.map(({ path, depth }) => [path, depth])).toEqual([
      ['/', 0],
      ['/plan', 1],
      ['/a', 1],
      ['/b', 1],
    ]);
  });

  it('counts navigations against the page limit, and says that it stopped there', async () => {
    const browser = fakeBrowser();

    const outcome = await crawl(
      { site: SITE, sitemapPages: [], robots: allowAllButPrivate, limits: limits({ maxPages: 2 }) },
      browser.deps,
    );

    expect(browser.paths()).toEqual(['/', '/a']);
    expect(outcome).toMatchObject({ status: 'completed', reason: 'page-limit' });
    expect(outcome.skipped.beyondLimits).toBeGreaterThan(0);
  });

  it('analyses two pages at a time, never more', async () => {
    const browser = fakeBrowser({ delayMs: () => 20 });

    await crawl(
      { site: SITE, sitemapPages: [], robots: allowAllButPrivate, limits: limits() },
      browser.deps,
    );

    expect(browser.maxActive()).toBe(2);
  });

  it('waits for its turn before every navigation', async () => {
    const browser = fakeBrowser();

    await crawl(
      { site: SITE, sitemapPages: [], robots: allowAllButPrivate, limits: limits() },
      browser.deps,
    );

    expect(browser.turns()).toBe(browser.visits.length);
  });

  it('gives each page the page time limit, or what is left of the scan time if less', async () => {
    const browser = fakeBrowser({ delayMs: () => 30 });

    await crawl(
      {
        site: SITE,
        sitemapPages: [],
        robots: allowAllButPrivate,
        limits: limits({ pageTimeoutMs: 50, scanTimeoutMs: 10_000 }),
      },
      browser.deps,
    );
    expect(browser.visits.every((visit) => visit.timeoutMs === 50)).toBe(true);

    const short = fakeBrowser({ delayMs: () => 30 });
    await crawl(
      {
        site: SITE,
        sitemapPages: [],
        robots: allowAllButPrivate,
        limits: limits({ pageTimeoutMs: 30_000, scanTimeoutMs: 1000 }),
      },
      short.deps,
    );
    expect(short.visits.every((visit) => visit.timeoutMs <= 1000)).toBe(true);
  });

  it('stops at the scan time limit and reports a partial scan', async () => {
    const browser = fakeBrowser({ delayMs: () => 80 });

    const outcome = await crawl(
      {
        site: SITE,
        sitemapPages: [],
        robots: allowAllButPrivate,
        limits: limits({ scanTimeoutMs: 120 }),
      },
      browser.deps,
    );

    expect(outcome).toMatchObject({ status: 'partial', reason: 'scan-timeout' });
    expect(browser.visits.length).toBeLessThan(5);
    expect(outcome.skipped.beyondLimits).toBeGreaterThan(0);
  });

  it('gives up before any navigation when robots.txt forbids the home page', async () => {
    const browser = fakeBrowser();
    const forbidAll: RobotsPolicy = {
      isAllowed: () => false,
      crawlDelayMs: null,
      sitemaps: [],
      reachable: true,
    };

    const outcome = await crawl(
      { site: SITE, sitemapPages: [], robots: forbidAll, limits: limits() },
      browser.deps,
    );

    expect(outcome).toEqual({
      status: 'failed',
      reason: 'disallowed-by-robots',
      pages: [],
      skipped: { disallowedByRobots: 0, beyondLimits: 0 },
    });
    expect(browser.visits).toEqual([]);
  });

  it('says the site is unreachable, rather than forbidden, when robots.txt could not be obtained', async () => {
    const browser = fakeBrowser();
    const unreachable: RobotsPolicy = {
      isAllowed: () => false,
      crawlDelayMs: null,
      sitemaps: [],
      reachable: false,
    };

    const outcome = await crawl(
      { site: SITE, sitemapPages: [], robots: unreachable, limits: limits() },
      browser.deps,
    );

    expect(outcome).toMatchObject({ status: 'failed', reason: 'site-unreachable', pages: [] });
    expect(browser.visits).toEqual([]);
  });

  it('fails when the home page cannot be analysed', async () => {
    const deps: CrawlDependencies = {
      waitTurn: () => Promise.resolve(),
      analyze: (page) =>
        Promise.resolve({
          result: {
            status: 'failed',
            url: page.url.href,
            depth: 0,
            error: 'timeout',
            httpStatus: null,
          },
          links: [],
        }),
    };

    const outcome = await crawl(
      { site: SITE, sitemapPages: [], robots: allowAllButPrivate, limits: limits() },
      deps,
    );

    expect(outcome).toMatchObject({ status: 'failed', reason: 'home-page-failed' });
  });

  it('follows the links of a redirected page from where it landed, and does not visit it again', async () => {
    const browser = fakeBrowser({ redirect: { '/b': '/a' } });

    await crawl(
      { site: SITE, sitemapPages: [], robots: allowAllButPrivate, limits: limits() },
      browser.deps,
    );

    // "/b" lands on "/a": "/a" is not visited a second time, and its link "b" resolves against "/a".
    expect(browser.paths().filter((path) => path === '/a')).toHaveLength(1);
  });

  it('lets a scan end when the turn is refused because the time is up', async () => {
    const deps: CrawlDependencies = {
      waitTurn: (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              reject(signal.reason as Error);
            },
            { once: true },
          );
        }),
      analyze: () => Promise.reject(new Error('never called')),
    };

    const outcome = await crawl(
      {
        site: SITE,
        sitemapPages: [],
        robots: allowAllButPrivate,
        limits: limits({ scanTimeoutMs: 50 }),
      },
      deps,
    );

    expect(outcome).toMatchObject({ status: 'failed', reason: 'home-page-failed', pages: [] });
    expect(outcome.skipped.beyondLimits).toBe(1);
  });
});
