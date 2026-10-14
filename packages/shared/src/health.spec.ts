import { describe, expect, it } from '@jest/globals';

import { buildHealthResponse, healthResponseSchema } from './health.js';

describe('buildHealthResponse', () => {
  it('reports ok when every dependency is up', () => {
    expect(buildHealthResponse({ database: 'up', queue: 'up' })).toEqual({
      status: 'ok',
      checks: { database: 'up', queue: 'up' },
    });
  });

  it.each([
    { database: 'down', queue: 'up' },
    { database: 'up', queue: 'down' },
    { database: 'down', queue: 'down' },
  ] as const)('reports degraded when a dependency is down: %o', (checks) => {
    expect(buildHealthResponse(checks).status).toBe('degraded');
  });
});

describe('healthResponseSchema', () => {
  it('accepts what buildHealthResponse produces', () => {
    const response = buildHealthResponse({ database: 'up', queue: 'down' });
    expect(healthResponseSchema.parse(response)).toEqual(response);
  });

  it('rejects an unknown dependency status', () => {
    const result = healthResponseSchema.safeParse({
      status: 'ok',
      checks: { database: 'up', queue: 'unknown' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing check and unexpected keys', () => {
    expect(
      healthResponseSchema.safeParse({ status: 'ok', checks: { database: 'up' } }).success,
    ).toBe(false);
    expect(
      healthResponseSchema.safeParse({
        status: 'ok',
        checks: { database: 'up', queue: 'up' },
        extra: true,
      }).success,
    ).toBe(false);
  });
});
