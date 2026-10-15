import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  type ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { Session } from './core/session';
import { sessionExpiry } from './core/session-expiry';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Route and query parameters arrive as component inputs.
    provideRouter(routes, withComponentInputBinding()),
    // The anti-CSRF header is on by default: X-XSRF-TOKEN, copied from the XSRF-TOKEN cookie.
    provideHttpClient(withInterceptors([sessionExpiry])),
    // The guards need to know who is signed in before the first navigation.
    provideAppInitializer(() => inject(Session).refresh()),
  ],
};
