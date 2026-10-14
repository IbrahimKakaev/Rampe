import { createRequire } from 'node:module';

/** The part of robots-parser used here, as its README documents it. */
interface ParsedRobots {
  isAllowed(url: string, userAgent: string): boolean | undefined;
  getCrawlDelay(userAgent: string): number | undefined;
  getSitemaps(): string[];
}

// robots-parser is a CommonJS module whose bundled type definitions do not
// resolve under NodeNext; it is loaded with require() and typed above.
const robotsParser = createRequire(import.meta.url)('robots-parser') as (
  url: string,
  contents: string,
) => ParsedRobots;

/** The product token RampeBot looks for in robots.txt. */
export const ROBOTS_TOKEN = 'RampeBot';

/** What robots.txt allows the crawler to do on a site. */
export interface RobotsPolicy {
  isAllowed(url: URL): boolean;
  /** Minimum delay between two requests that the site asks for, if any. */
  readonly crawlDelayMs: number | null;
  /** Sitemaps the site announces. */
  readonly sitemaps: readonly string[];
}

const allowAll: RobotsPolicy = { isAllowed: () => true, crawlDelayMs: null, sitemaps: [] };
const disallowAll: RobotsPolicy = { isAllowed: () => false, crawlDelayMs: null, sitemaps: [] };

/**
 * Reads the answer to a request for /robots.txt, following RFC 9309:
 * - a successful answer is parsed;
 * - "unavailable" (4xx): the crawler may access any page;
 * - "unreachable" (5xx, or no answer at all): the crawler must assume
 *   everything is disallowed.
 */
export function robotsPolicyFrom(
  robotsUrl: string,
  answer: { readonly status: number; readonly body: string } | null,
): RobotsPolicy {
  if (answer === null || answer.status >= 500) {
    return disallowAll;
  }
  if (answer.status >= 400) {
    return allowAll;
  }
  if (answer.status < 200 || answer.status >= 300) {
    return disallowAll;
  }
  const robots = robotsParser(robotsUrl, answer.body);
  const crawlDelay = robots.getCrawlDelay(ROBOTS_TOKEN);
  return {
    // The parser answers `undefined` for a URL of another site; those are never crawled.
    isAllowed: (url) => robots.isAllowed(url.href, ROBOTS_TOKEN) === true,
    crawlDelayMs:
      crawlDelay !== undefined && Number.isFinite(crawlDelay) && crawlDelay > 0
        ? crawlDelay * 1000
        : null,
    sitemaps: robots.getSitemaps(),
  };
}
