import { describe, expect, it } from '@jest/globals';

import { robotsPolicyFrom } from './robots.js';

const ROBOTS_URL = 'https://www.example.fr/robots.txt';
const page = (path: string): URL => new URL(path, 'https://www.example.fr');

describe('robotsPolicyFrom', () => {
  it('applies the group of RampeBot when there is one, and only that group', () => {
    const policy = robotsPolicyFrom(ROBOTS_URL, {
      status: 200,
      body: [
        'User-agent: *',
        'Disallow: /prive/',
        '',
        'User-agent: RampeBot',
        'Disallow: /lourd/',
      ].join('\n'),
    });

    expect(policy.isAllowed(page('/lourd/rapport'))).toBe(false);
    // RFC 9309: a crawler follows the most specific group alone.
    expect(policy.isAllowed(page('/prive/compte'))).toBe(true);
    expect(policy.isAllowed(page('/'))).toBe(true);
  });

  it('applies the generic group otherwise', () => {
    const policy = robotsPolicyFrom(ROBOTS_URL, {
      status: 200,
      body: 'User-agent: *\nDisallow: /prive/\n',
    });

    expect(policy.isAllowed(page('/prive/compte'))).toBe(false);
    expect(policy.isAllowed(page('/contact'))).toBe(true);
  });

  it('matches the product token whatever its case', () => {
    const policy = robotsPolicyFrom(ROBOTS_URL, {
      status: 200,
      body: 'User-agent: rampebot\nDisallow: /\n',
    });

    expect(policy.isAllowed(page('/'))).toBe(false);
  });

  it('reads the crawl delay and the sitemaps', () => {
    const policy = robotsPolicyFrom(ROBOTS_URL, {
      status: 200,
      body: 'User-agent: RampeBot\nCrawl-delay: 2.5\n\nSitemap: https://www.example.fr/plan.xml\n',
    });

    expect(policy.crawlDelayMs).toBe(2500);
    expect(policy.sitemaps).toEqual(['https://www.example.fr/plan.xml']);
  });

  it('ignores a crawl delay that is not a positive number', () => {
    expect(
      robotsPolicyFrom(ROBOTS_URL, { status: 200, body: 'User-agent: *\nCrawl-delay: soon\n' })
        .crawlDelayMs,
    ).toBeNull();
  });

  it('never allows a page of another site', () => {
    const policy = robotsPolicyFrom(ROBOTS_URL, { status: 200, body: '' });

    expect(policy.isAllowed(new URL('https://other.example/'))).toBe(false);
  });

  it.each([404, 410, 401, 403])(
    'allows everything when robots.txt is unavailable (%i)',
    (status) => {
      expect(robotsPolicyFrom(ROBOTS_URL, { status, body: '' }).isAllowed(page('/prive/'))).toBe(
        true,
      );
    },
  );

  it.each([500, 503])(
    'disallows everything when the server fails (%i), and says it is unreachable',
    (status) => {
      const policy = robotsPolicyFrom(ROBOTS_URL, { status, body: '' });

      expect(policy.isAllowed(page('/'))).toBe(false);
      expect(policy.reachable).toBe(false);
    },
  );

  it('disallows everything when robots.txt cannot be fetched at all', () => {
    const policy = robotsPolicyFrom(ROBOTS_URL, null);

    expect(policy.isAllowed(page('/'))).toBe(false);
    expect(policy.reachable).toBe(false);
  });

  it('says the site is reachable when it answered', () => {
    expect(robotsPolicyFrom(ROBOTS_URL, { status: 200, body: '' }).reachable).toBe(true);
    expect(robotsPolicyFrom(ROBOTS_URL, { status: 404, body: '' }).reachable).toBe(true);
  });

  it('disallows everything after an unexpected status', () => {
    expect(robotsPolicyFrom(ROBOTS_URL, { status: 304, body: '' }).isAllowed(page('/'))).toBe(
      false,
    );
  });
});
