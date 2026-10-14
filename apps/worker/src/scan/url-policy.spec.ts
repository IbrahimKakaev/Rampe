import { describe, expect, it } from '@jest/globals';

import { isOnSite, mayBeDocument, toPageUrl } from './url-policy.js';

describe('toPageUrl', () => {
  it('resolves a relative link and drops the fragment', () => {
    expect(
      toPageUrl('../b/page.html?x=1#section', 'https://www.example.fr/a/index.html')?.href,
    ).toBe('https://www.example.fr/b/page.html?x=1');
  });

  it('normalises the host and the default port', () => {
    expect(toPageUrl('HTTPS://WWW.Example.FR:443/')?.href).toBe('https://www.example.fr/');
    expect(toPageUrl('http://example.fr:80/a')?.href).toBe('http://example.fr/a');
  });

  it('keeps ports 80 and 443 when they are not the default of the scheme', () => {
    expect(toPageUrl('https://example.fr:80/')?.port).toBe('80');
  });

  it.each([
    'mailto:contact@example.fr',
    'tel:+33100000000',
    'javascript:alert(1)',
    'ftp://example.fr/',
    'file:///etc/passwd',
    'data:text/html,hi',
    'https://user:pass@example.fr/',
    'http://example.fr:8080/',
    'http://[',
  ])('refuses %s', (href) => {
    expect(toPageUrl(href, 'https://example.fr/')).toBeNull();
  });
});

describe('isOnSite', () => {
  const site = new URL('https://www.example.fr/');

  it('accepts pages of the same origin', () => {
    expect(isOnSite(new URL('https://www.example.fr/contact'), site)).toBe(true);
  });

  it.each([
    'https://example.fr/',
    'https://shop.example.fr/',
    'http://www.example.fr/',
    'https://www.example.fr.evil.test/',
  ])('refuses %s, which is another site', (url) => {
    expect(isOnSite(new URL(url), site)).toBe(false);
  });
});

describe('mayBeDocument', () => {
  it.each([
    'https://e.fr/',
    'https://e.fr/contact',
    'https://e.fr/page.html',
    'https://e.fr/page.php?id=2',
    'https://e.fr/v1.2/',
  ])('treats %s as a possible page', (url) => {
    expect(mayBeDocument(new URL(url))).toBe(true);
  });

  it.each([
    'https://e.fr/guide.pdf',
    'https://e.fr/logo.PNG',
    'https://e.fr/feed.xml',
    'https://e.fr/a/archive.zip?x=1',
  ])('skips %s, which is a file', (url) => {
    expect(mayBeDocument(new URL(url))).toBe(false);
  });
});
