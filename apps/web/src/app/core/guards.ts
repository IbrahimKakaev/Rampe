import { inject } from '@angular/core';
import { type CanActivateFn, RedirectCommand, Router } from '@angular/router';
import { RETURN_PARAMETER, webPath } from '@rampe/shared';

import { Session } from './session';

/** Pages that need a session send a visitor to the sign-in page, then back. */
export const requireSession: CanActivateFn = (_route, state) => {
  if (inject(Session).signedIn()) {
    return true;
  }
  const router = inject(Router);
  return new RedirectCommand(
    router.createUrlTree([webPath('login')], { queryParams: { [RETURN_PARAMETER]: state.url } }),
  );
};

/** The sign-in and sign-up pages send someone already signed in to their sites. */
export const guestOnly: CanActivateFn = () => {
  if (!inject(Session).signedIn()) {
    return true;
  }
  return new RedirectCommand(inject(Router).parseUrl(webPath('dashboard')));
};

/** "My sites" leads to the sites of the person's first organisation. */
export const toFirstOrganization: CanActivateFn = () => {
  const [first] = inject(Session).me()?.organizations ?? [];
  if (first === undefined) {
    return true;
  }
  return new RedirectCommand(inject(Router).parseUrl(webPath('sites', { org: first.id })));
};

/**
 * Where to go after signing in. Only a path of this application is accepted:
 * a return address taken from the URL must not send anyone to another site.
 */
export function safeReturnPath(value: string | null | undefined): string {
  return value !== null &&
    value !== undefined &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\')
    ? value
    : webPath('dashboard');
}
