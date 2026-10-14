import type { ScanLimits, ScanReport } from '@rampe/shared';
import { chromium } from 'playwright-core';

import { crawl } from './crawler.js';
import type { TextFetcher } from './http-fetcher.js';
import { createPageAnalyzer } from './page-analyzer.js';
import type { NavigationGate } from './politeness.js';
import { robotsPolicyFrom, type RobotsPolicy } from './robots.js';
import { parseSitemap } from './sitemap.js';
import { isOnSite, toPageUrl } from './url-policy.js';

const ROBOTS_MAX_BYTES = 512 * 1024;
const SITEMAP_MAX_BYTES = 10 * 1024 * 1024;
/** Sitemap documents read at most, index files included. */
const SITEMAP_MAX_DOCUMENTS = 5;
const SITEMAP_MAX_PAGES = 1000;

export class InvalidTargetError extends Error {
  override readonly name = 'InvalidTargetError';
}

export interface ScanServices {
  readonly browserWsEndpoint: string;
  readonly fetchText: TextFetcher;
  readonly gate: NavigationGate;
  readonly userAgent: string;
  /** Receives one line per step of the scan, for the operator. */
  readonly log?: (message: string) => void;
}

/**
 * Runs a scan of a site: reads robots.txt, then the sitemaps, then explores the
 * pages in the isolated browser. Every request, robots.txt and sitemaps
 * included, waits for its turn at the politeness gate of the host.
 */
export async function runScan(
  request: { readonly url: string; readonly limits: ScanLimits },
  services: ScanServices,
): Promise<ScanReport> {
  const { limits } = request;
  const site = toPageUrl(request.url);
  if (site === null) {
    throw new InvalidTargetError(
      'The address to scan must be an http or https URL on port 80 or 443.',
    );
  }
  const startedAt = new Date();
  const log = (message: string): void => {
    services.log?.(`${String(Date.now() - startedAt.getTime()).padStart(6)} ms  ${message}`);
  };
  const scanSignal = AbortSignal.timeout(limits.scanTimeoutMs);
  let intervalMs = limits.navigationIntervalMs;
  const waitTurn = (signal: AbortSignal): Promise<void> =>
    services.gate.wait(site.host, intervalMs, signal);

  const robotsUrl = new URL('/robots.txt', site).href;
  await waitTurn(scanSignal);
  const robots = robotsPolicyFrom(robotsUrl, await services.fetchText(robotsUrl, ROBOTS_MAX_BYTES));
  log(`robots.txt read (${robots.reachable ? 'site reachable' : 'site unreachable'})`);
  intervalMs = Math.max(limits.navigationIntervalMs, robots.crawlDelayMs ?? 0);
  const sitemapPages = await collectSitemapPages(site, robots, services.fetchText, () =>
    waitTurn(scanSignal),
  );
  log(`sitemaps read: ${String(sitemapPages.length)} page(s)`);

  const browser = await chromium.connect(services.browserWsEndpoint, { timeout: 30_000 });
  log('browser connected');
  try {
    const context = await browser.newContext({
      userAgent: services.userAgent,
      acceptDownloads: false,
      serviceWorkers: 'block',
      locale: 'fr-FR',
      viewport: { width: 1280, height: 800 },
    });
    let axeVersion: string | null = null;
    const analyzePage = createPageAnalyzer(context, site, (version) => {
      axeVersion = version;
    });
    const analyze: typeof analyzePage = async (page, timeoutMs) => {
      const outcome = await analyzePage(page, timeoutMs);
      const { result } = outcome;
      log(
        `${result.status === 'analyzed' ? 'analysed' : `failed (${result.error})`}  ${result.url}`,
      );
      return outcome;
    };
    const elapsed = Date.now() - startedAt.getTime();
    const outcome = await crawl(
      {
        site,
        sitemapPages,
        robots,
        limits: { ...limits, scanTimeoutMs: Math.max(limits.scanTimeoutMs - elapsed, 1) },
      },
      { analyze, waitTurn },
    );
    log(`crawl ${outcome.status}`);
    await context.close();
    log('browser context closed');
    return {
      target: site.href,
      ...outcome,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      engine: { axeVersion, userAgent: services.userAgent },
      limits,
    };
  } finally {
    await browser.close();
    log('browser disconnected');
  }
}

/** Collects the pages of the site's sitemaps: /sitemap.xml and those robots.txt announces. */
export async function collectSitemapPages(
  site: URL,
  robots: RobotsPolicy,
  fetchText: TextFetcher,
  waitTurn: () => Promise<void>,
): Promise<string[]> {
  const queue = [new URL('/sitemap.xml', site).href, ...robots.sitemaps];
  const queued = new Set<string>();
  const pages: string[] = [];
  let documents = 0;
  while (
    queue.length > 0 &&
    documents < SITEMAP_MAX_DOCUMENTS &&
    pages.length < SITEMAP_MAX_PAGES
  ) {
    const location = toPageUrl(queue.shift() ?? '');
    if (
      location === null ||
      !isOnSite(location, site) ||
      queued.has(location.href) ||
      !robots.isAllowed(location)
    ) {
      continue;
    }
    queued.add(location.href);
    documents += 1;
    await waitTurn();
    const answer = await fetchText(location.href, SITEMAP_MAX_BYTES);
    if (answer === null || answer.status < 200 || answer.status >= 300) {
      continue;
    }
    const content = parseSitemap(answer.body);
    pages.push(...content.pages);
    queue.push(...content.sitemaps);
  }
  return pages.slice(0, SITEMAP_MAX_PAGES);
}
