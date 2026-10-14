import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';

import type { Probe } from '../infra/probe.js';
import { HealthService, PROBE_TIMEOUT_MS } from './health.service.js';

const up: Probe = { ping: () => Promise.resolve() };
const down: Probe = { ping: () => Promise.reject(new Error('connection refused to 10.0.0.5')) };
const silent: Probe = { ping: () => new Promise<void>(() => undefined) };

describe('HealthService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('reports ok when every dependency answers', async () => {
    await expect(new HealthService(up, up).check()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up', queue: 'up' },
    });
  });

  it('reports which dependency is down', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await expect(new HealthService(down, up).check()).resolves.toEqual({
      status: 'degraded',
      checks: { database: 'down', queue: 'up' },
    });
    await expect(new HealthService(up, down).check()).resolves.toEqual({
      status: 'degraded',
      checks: { database: 'up', queue: 'down' },
    });
  });

  it('logs the reason without putting it in the response', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const response = await new HealthService(down, up).check();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('connection refused to 10.0.0.5'));
    expect(JSON.stringify(response)).not.toContain('10.0.0.5');
  });

  it('reports a dependency that does not answer in time as down', async () => {
    jest.useFakeTimers();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const pending = new HealthService(up, silent).check();
    await jest.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS);

    await expect(pending).resolves.toEqual({
      status: 'degraded',
      checks: { database: 'up', queue: 'down' },
    });
  });
});
