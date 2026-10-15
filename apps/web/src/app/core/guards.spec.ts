import { TestBed } from '@angular/core/testing';
import {
  type ActivatedRouteSnapshot,
  provideRouter,
  RedirectCommand,
  Router,
  type RouterStateSnapshot,
} from '@angular/router';
import { describe, expect, it } from '@jest/globals';
import type { Me } from '@rampe/shared';

import { guestOnly, requireSession, safeReturnPath, toFirstOrganization } from './guards';
import { Session } from './session';

const ME: Me = {
  user: { id: '0192f2b0-0000-7000-8000-000000000001', email: 'a@exemple.fr', name: 'A' },
  organizations: [{ id: '0192f2b0-0000-7000-8000-0000000000aa', name: 'Org', role: 'OWNER' }],
};

function run(
  guard: typeof requireSession,
  me: Me | null,
  url = '/organisations/x/sites',
): ReturnType<typeof requireSession> {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: Session, useValue: { me: () => me, signedIn: () => me !== null } },
    ],
  });
  return TestBed.runInInjectionContext(() =>
    guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
  );
}

function target(result: ReturnType<typeof requireSession>): string {
  expect(result).toBeInstanceOf(RedirectCommand);
  return TestBed.inject(Router).serializeUrl((result as RedirectCommand).redirectTo);
}

describe('requireSession', () => {
  it('lets a signed-in person through', () => {
    expect(run(requireSession, ME)).toBe(true);
  });

  it('sends a visitor to the sign-in page, with the way back', () => {
    expect(target(run(requireSession, null))).toBe(
      '/connexion?retour=%2Forganisations%2Fx%2Fsites',
    );
  });
});

describe('guestOnly', () => {
  it('lets a visitor through', () => {
    expect(run(guestOnly, null)).toBe(true);
  });

  it('sends someone already signed in to their sites', () => {
    expect(target(run(guestOnly, ME))).toBe('/tableau-de-bord');
  });
});

describe('toFirstOrganization', () => {
  it('opens the sites of the first organisation', () => {
    expect(target(run(toFirstOrganization, ME))).toBe(
      '/organisations/0192f2b0-0000-7000-8000-0000000000aa/sites',
    );
  });

  it('stays on the page for someone without any organisation', () => {
    expect(run(toFirstOrganization, { ...ME, organizations: [] })).toBe(true);
  });
});

describe('safeReturnPath', () => {
  it('accepts a path of the application', () => {
    expect(safeReturnPath('/organisations/x/sites?groupe=page')).toBe(
      '/organisations/x/sites?groupe=page',
    );
  });

  it.each([
    ['another site', 'https://exemple.fr/'],
    ['a protocol-relative address', '//exemple.fr/'],
    ['a backslash trick', '/\\exemple.fr'],
    ['nothing', undefined],
  ])('refuses %s and falls back to the sites', (_label, value) => {
    expect(safeReturnPath(value)).toBe('/tableau-de-bord');
  });
});
