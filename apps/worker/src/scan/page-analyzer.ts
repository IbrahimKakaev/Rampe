import { AxeBuilder } from '@axe-core/playwright';
import type { FailedPage, PageError } from '@rampe/shared';
import type { BrowserContext, Page } from 'playwright-core';

import { EGRESS_HEADER } from '../egress/egress-proxy.js';
import { toViolations, WCAG_TAGS } from './axe-results.js';
import type { PageOutcome, PageToVisit } from './crawler.js';
import { isOnSite, toPageUrl } from './url-policy.js';

class PageTimeout extends Error {
  override readonly name = 'PageTimeout';
}

function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new PageTimeout(`no result within ${String(ms)} ms`));
      }, ms);
    }),
  ]).finally(() => {
    clearTimeout(timer);
  });
}

function isTimeout(error: unknown): boolean {
  return error instanceof PageTimeout || (error instanceof Error && error.name === 'TimeoutError');
}

/**
 * Loads a page in its own tab, waits for the load event, runs axe-core on the
 * WCAG 2.1 A and AA rules and collects the links. Every failure becomes a
 * failed page result: one bad page never stops the scan.
 */
export function createPageAnalyzer(
  context: BrowserContext,
  site: URL,
  onEngineVersion: (version: string) => void,
): (page: PageToVisit, timeoutMs: number) => Promise<PageOutcome> {
  return async ({ url, depth }, timeoutMs) => {
    const deadline = Date.now() + timeoutMs;
    const failed = (error: PageError, httpStatus: number | null = null): PageOutcome => {
      const result: FailedPage = { status: 'failed', url: url.href, depth, error, httpStatus };
      return { result, links: [] };
    };

    let tab: Page | undefined;
    try {
      tab = await context.newPage();
      // A page may open windows; they are closed at once and never analysed.
      tab.on('popup', (popup) => {
        void popup.close();
      });
      const response = await tab.goto(url.href, { waitUntil: 'load', timeout: timeoutMs });
      if (response === null) {
        return failed('navigation-failed');
      }
      const status = response.status();
      if (response.headers()[EGRESS_HEADER] === 'blocked') {
        return failed('blocked', status);
      }
      const landed = toPageUrl(tab.url());
      if (landed === null || !isOnSite(landed, site)) {
        return failed('redirected-off-site', status);
      }
      if (status >= 400) {
        return failed('http-error', status);
      }
      const contentType = response.headers()['content-type'] ?? '';
      if (!/^(text\/html|application\/xhtml\+xml)\b/i.test(contentType)) {
        return failed('not-html', status);
      }

      const analysis = await within(
        new AxeBuilder({ page: tab }).withTags(WCAG_TAGS).analyze(),
        Math.max(deadline - Date.now(), 1),
      );
      onEngineVersion(analysis.testEngine.version);
      const links = await within(
        tab.$$eval('a[href], area[href]', (anchors) =>
          anchors.map((anchor) => (anchor as HTMLAnchorElement | HTMLAreaElement).href),
        ),
        Math.max(deadline - Date.now(), 1),
      );
      const { violations, truncated } = toViolations(analysis.violations);
      return {
        result: {
          status: 'analyzed',
          url: landed.href,
          depth,
          httpStatus: status,
          title: await tab.title(),
          passed: analysis.passes.map((rule) => rule.id),
          incomplete: analysis.incomplete.map((rule) => rule.id),
          violations,
          truncated,
        },
        links,
      };
    } catch (error) {
      return failed(isTimeout(error) ? 'timeout' : 'navigation-failed');
    } finally {
      await tab?.close().catch(() => undefined);
    }
  };
}
