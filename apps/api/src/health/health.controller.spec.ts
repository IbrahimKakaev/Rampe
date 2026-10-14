import { describe, expect, it } from '@jest/globals';
import { HttpException } from '@nestjs/common';
import type { HealthResponse } from '@rampe/shared';

import { HealthController } from './health.controller.js';
import type { HealthService } from './health.service.js';

function controllerReturning(response: HealthResponse): HealthController {
  const service = { check: () => Promise.resolve(response) } as unknown as HealthService;
  return new HealthController(service);
}

describe('HealthController', () => {
  it('returns the report when everything is up', async () => {
    const ok: HealthResponse = { status: 'ok', checks: { database: 'up', queue: 'up' } };

    await expect(controllerReturning(ok).get()).resolves.toEqual(ok);
  });

  it('answers 503 with the same report when a dependency is down', async () => {
    const degraded: HealthResponse = {
      status: 'degraded',
      checks: { database: 'down', queue: 'up' },
    };

    const error = await controllerReturning(degraded)
      .get()
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(503);
    expect((error as HttpException).getResponse()).toEqual(degraded);
  });
});
