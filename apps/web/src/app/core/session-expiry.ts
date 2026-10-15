import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { RETURN_PARAMETER, webPath } from '@rampe/shared';
import { catchError, throwError } from 'rxjs';

import { API } from './api';
import { Session } from './session';

/** Requests whose 401 answer is expected and handled where they are made. */
const SESSION_REQUESTS = [`${API}/auth/me`, `${API}/auth/login`];

/**
 * When the API answers 401 to a page's request, the session has expired: the
 * person is sent to the sign-in page, and comes back here afterwards.
 */
export const sessionExpiry: HttpInterceptorFn = (request, next) => {
  const session = inject(Session);
  const router = inject(Router);
  return next(request).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !SESSION_REQUESTS.includes(request.url)
      ) {
        session.clear();
        void router.navigate([webPath('login')], {
          queryParams: { [RETURN_PARAMETER]: router.url },
        });
      }
      return throwError(() => error);
    }),
  );
};
