import { describe, expect, it } from '@jest/globals';

import { webPath, WEB_ROUTES } from './web-routes.js';

describe('webPath', () => {
  it('gives the absolute path of a page without parameters', () => {
    expect(webPath('home')).toBe('/');
    expect(webPath('verifyEmail')).toBe('/verifier-email');
  });

  it('fills in and encodes the parameters of a page', () => {
    expect(webPath('finding', { org: 'o', scan: 's', finding: 'a/b' })).toBe(
      '/organisations/o/scans/s/defauts/a%2Fb',
    );
  });

  it('refuses an empty parameter rather than build a wrong address', () => {
    expect(() => webPath('site', { org: 'o', site: '' })).toThrow('Missing parameter "site"');
  });
});

describe('WEB_ROUTES', () => {
  it('gives every page a distinct path', () => {
    const paths = Object.values(WEB_ROUTES);

    expect(new Set(paths).size).toBe(paths.length);
  });

  it('writes paths without a leading slash, as the router expects them', () => {
    expect(Object.values(WEB_ROUTES).filter((path) => path.startsWith('/'))).toEqual([]);
  });
});
