import { describe, expect, it } from '@jest/globals';

import { monthsBefore, nextScanAt } from './schedule.js';

describe('nextScanAt', () => {
  const now = new Date('2026-10-16T09:30:00.000Z');

  it('comes a day later for a daily schedule, a week later for a weekly one', () => {
    expect(nextScanAt('DAILY', now)?.toISOString()).toBe('2026-10-17T09:30:00.000Z');
    expect(nextScanAt('WEEKLY', now)?.toISOString()).toBe('2026-10-23T09:30:00.000Z');
  });

  it('is null without a schedule', () => {
    expect(nextScanAt('NONE', now)).toBeNull();
  });
});

describe('monthsBefore', () => {
  it('goes back whole calendar months, keeping the time of day', () => {
    expect(monthsBefore(new Date('2026-10-16T09:30:00.000Z'), 12).toISOString()).toBe(
      '2025-10-16T09:30:00.000Z',
    );
    expect(monthsBefore(new Date('2026-01-15T00:00:00.000Z'), 1).toISOString()).toBe(
      '2025-12-15T00:00:00.000Z',
    );
  });

  it('falls back to the last day of a shorter month', () => {
    expect(monthsBefore(new Date('2026-03-31T12:00:00.000Z'), 1).toISOString()).toBe(
      '2026-02-28T12:00:00.000Z',
    );
    expect(monthsBefore(new Date('2028-03-31T12:00:00.000Z'), 1).toISOString()).toBe(
      '2028-02-29T12:00:00.000Z',
    );
  });
});
