import type { PageResult, ScanLimits, ScanReport } from '@rampe/shared';

import type { RobotsPolicy } from './robots.js';
import { isOnSite, mayBeDocument, toPageUrl } from './url-policy.js';

/** A page waiting to be visited, and how many links away from the home page it is. */
export interface PageToVisit {
  readonly url: URL;
  readonly depth: number;
}

export interface PageOutcome {
  readonly result: PageResult;
  /** Every link found on the page, as written; the crawler decides which to follow. */
  readonly links: readonly string[];
}

export interface CrawlInput {
  /** The home page. Only its origin is crawled. */
  readonly site: URL;
  /** Pages known from the sitemaps. */
  readonly sitemapPages: readonly string[];
  readonly robots: RobotsPolicy;
  readonly limits: ScanLimits;
}

export interface CrawlDependencies {
  /** Loads and analyses one page; must give up within `timeoutMs`. */
  readonly analyze: (page: PageToVisit, timeoutMs: number) => Promise<PageOutcome>;
  /** Waits until a navigation to the site is allowed by the politeness rules. */
  readonly waitTurn: (signal: AbortSignal) => Promise<void>;
  readonly now?: () => number;
}

export type CrawlOutcome = Pick<ScanReport, 'status' | 'reason' | 'pages' | 'skipped'>;

/**
 * Explores a site breadth first, from its home page and its sitemaps, within
 * the limits of the scan: number of pages, depth, pages in parallel, time per
 * page and time for the whole scan.
 *
 * The page limit counts navigations, failed ones included: it bounds what the
 * crawler asks of the site, not only what it reports.
 */
export async function crawl(input: CrawlInput, deps: CrawlDependencies): Promise<CrawlOutcome> {
  const { site, robots, limits } = input;
  const now = deps.now ?? Date.now;
  const deadline = now() + limits.scanTimeoutMs;
  const stop = new AbortController();
  // Read through a function: the flag changes between two awaits, which type narrowing ignores.
  const stopped = (): boolean => stop.signal.aborted;
  const timer = setTimeout(() => {
    stop.abort(new Error('scan time limit reached'));
  }, limits.scanTimeoutMs);

  const skipped = { disallowedByRobots: 0, beyondLimits: 0 };
  if (!robots.isAllowed(site)) {
    clearTimeout(timer);
    return { status: 'failed', reason: 'disallowed-by-robots', pages: [], skipped };
  }

  const frontier: PageToVisit[] = [{ url: site, depth: 0 }];
  const seen = new Set<string>([site.href]);
  const consider = (href: string, base: string | undefined, depth: number): void => {
    const url = toPageUrl(href, base);
    if (url === null || !isOnSite(url, site) || !mayBeDocument(url) || seen.has(url.href)) {
      return;
    }
    seen.add(url.href);
    if (!robots.isAllowed(url)) {
      skipped.disallowedByRobots += 1;
    } else if (depth > limits.maxDepth) {
      skipped.beyondLimits += 1;
    } else {
      frontier.push({ url, depth });
    }
  };
  // The sitemap protocol requires absolute URLs: an entry is never resolved against the site.
  for (const page of input.sitemapPages) {
    consider(page, undefined, 1);
  }

  // Results are kept in the order the navigations started.
  const results: (PageResult | undefined)[] = [];
  let navigations = 0;
  let inFlight = 0;
  const waiting: (() => void)[] = [];
  const waitForWork = (): Promise<void> =>
    new Promise((resolve) => {
      waiting.push(resolve);
    });
  const wakeAll = (): void => {
    for (const resolve of waiting.splice(0)) {
      resolve();
    }
  };

  const visitPages = async (): Promise<void> => {
    while (!stopped() && navigations < limits.maxPages) {
      const page = frontier.shift();
      if (page === undefined) {
        if (inFlight === 0) {
          return;
        }
        // Another page in progress may still add links to the frontier.
        await Promise.race([waitForWork(), aborted(stop.signal)]);
        continue;
      }
      inFlight += 1;
      const index = navigations;
      navigations += 1;
      try {
        await deps.waitTurn(stop.signal);
        const remaining = deadline - now();
        if (remaining <= 0) {
          frontier.unshift(page);
          navigations -= 1;
          return;
        }
        const outcome = await deps.analyze(page, Math.min(limits.pageTimeoutMs, remaining));
        results[index] = outcome.result;
        seen.add(outcome.result.url);
        for (const link of outcome.links) {
          consider(link, outcome.result.url, page.depth + 1);
        }
      } catch (error) {
        if (!stopped()) {
          throw error;
        }
        // The time limit fell while waiting for a turn: the page was not visited.
        frontier.unshift(page);
        navigations -= 1;
      } finally {
        inFlight -= 1;
        wakeAll();
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: limits.concurrency }, visitPages));
  } finally {
    clearTimeout(timer);
    wakeAll();
  }

  const pages = results.filter((result): result is PageResult => result !== undefined);
  skipped.beyondLimits += frontier.length;
  const home = pages[0];
  if (home === undefined || home.status === 'failed') {
    return { status: 'failed', reason: 'home-page-failed', pages, skipped };
  }
  if (stopped()) {
    return { status: 'partial', reason: 'scan-timeout', pages, skipped };
  }
  if (frontier.length > 0) {
    return { status: 'completed', reason: 'page-limit', pages, skipped };
  }
  return { status: 'completed', reason: null, pages, skipped };
}

function aborted(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    signal.addEventListener(
      'abort',
      () => {
        resolve();
      },
      { once: true },
    );
  });
}
