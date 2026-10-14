import { describe, expect, it } from '@jest/globals';
import { PING_JOB, pingResultSchema } from '@rampe/shared';
import { UnrecoverableError } from 'bullmq';

import { handleSystemJob } from './system-worker.js';

const now = (): Date => new Date('2026-10-14T08:30:00.000Z');

describe('handleSystemJob', () => {
  it('answers a ping with the time it was handled, in the shared result format', () => {
    const result = handleSystemJob(PING_JOB, now);

    expect(result).toEqual({ pong: true, handledAt: '2026-10-14T08:30:00.000Z' });
    expect(pingResultSchema.parse(result)).toEqual(result);
  });

  it('fails an unknown job without asking for a retry', () => {
    expect(() => handleSystemJob('reticulate-splines', now)).toThrow(UnrecoverableError);
    expect(() => handleSystemJob('reticulate-splines', now)).toThrow('reticulate-splines');
  });
});
