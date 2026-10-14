import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { firstValueFrom } from 'rxjs';

import { HealthApi } from './health-api';

describe('HealthApi', () => {
  let api: HealthApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(HealthApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('returns the report when everything is up', async () => {
    const state = firstValueFrom(api.load());
    const report = { status: 'ok', checks: { database: 'up', queue: 'up' } };
    http.expectOne('/api/v1/health').flush(report);

    await expect(state).resolves.toEqual({ kind: 'loaded', health: report });
  });

  it('still returns the report when the API answers 503 because a dependency is down', async () => {
    const state = firstValueFrom(api.load());
    const report = { status: 'degraded', checks: { database: 'down', queue: 'up' } };
    http
      .expectOne('/api/v1/health')
      .flush(report, { status: 503, statusText: 'Service Unavailable' });

    await expect(state).resolves.toEqual({ kind: 'loaded', health: report });
  });

  it('reports the API as unreachable on a network error', async () => {
    const state = firstValueFrom(api.load());
    http.expectOne('/api/v1/health').error(new ProgressEvent('error'));

    await expect(state).resolves.toEqual({ kind: 'unreachable' });
  });

  it.each([
    ['an error page from a proxy', '<html>Bad Gateway</html>', 502],
    ['a body that is not a health report', { status: 'ok' }, 200],
  ])('reports the API as unreachable on %s', async (_label, body, status) => {
    const state = firstValueFrom(api.load());
    http.expectOne('/api/v1/health').flush(body, { status, statusText: 'x' });

    await expect(state).resolves.toEqual({ kind: 'unreachable' });
  });
});
