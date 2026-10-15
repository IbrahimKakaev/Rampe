import { describe, expect, it } from '@jest/globals';
import { WEB_ROUTES } from '@rampe/shared';

import { routes } from './app.routes';
import { requireSession } from './core/guards';

describe('routes', () => {
  it('declare exactly the pages of WEB_ROUTES, which the accessibility test visits one by one', () => {
    const declared = routes.map((route) => route.path).sort();

    expect(declared).toEqual(Object.values(WEB_ROUTES).sort());
  });

  it('give every page a title', () => {
    expect(routes.filter((route) => typeof route.title !== 'string')).toEqual([]);
  });

  it('require a session for every page of an organisation', () => {
    const open = routes.filter(
      (route) => route.path?.includes(':org') === true && route.canActivate?.[0] !== requireSession,
    );

    expect(open).toEqual([]);
  });

  it('match "nouveau" as the new-site page, not as the id of a site', () => {
    const paths = routes.map((route) => route.path);

    expect(paths.indexOf(WEB_ROUTES.newSite)).toBeLessThan(paths.indexOf(WEB_ROUTES.site));
  });
});
