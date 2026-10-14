import { ForbiddenException, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';

import type { RampeRequest } from './request-context.js';
import { newToken, sameSecret } from './secrets.js';

export const CSRF_COOKIE = 'XSRF-TOKEN';
export const CSRF_HEADER = 'x-xsrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit protection against cross-site requests, the scheme Angular's
 * HttpClient supports out of the box: a readable cookie holds a random token,
 * and every request that changes something must repeat it in a header. Another
 * site can make the browser send the cookie, but cannot read it.
 */
export function csrfProtection(secureCookies: boolean): NestMiddleware['use'] {
  return (request: RampeRequest, response: Response, next: NextFunction): void => {
    let token = (request.cookies as Record<string, unknown> | undefined)?.[CSRF_COOKIE];
    if (typeof token !== 'string' || token === '') {
      token = newToken();
      response.cookie(CSRF_COOKIE, token, { sameSite: 'lax', secure: secureCookies, path: '/' });
    }
    if (!SAFE_METHODS.has(request.method)) {
      const header = request.header(CSRF_HEADER);
      if (header === undefined || !sameSecret(header, token as string)) {
        next(new ForbiddenException('Jeton CSRF absent ou invalide'));
        return;
      }
    }
    next();
  };
}
