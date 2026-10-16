import type { ScanSchedule } from '../generated/prisma/client.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Time between two scheduled scans of a site. */
export const SCHEDULE_INTERVAL_MS: Readonly<Record<Exclude<ScanSchedule, 'NONE'>, number>> = {
  DAILY: DAY_MS,
  WEEKLY: 7 * DAY_MS,
};

/**
 * When the next scheduled scan of a site is due, counted from `from`; null
 * without a schedule. Counting from the moment the scan starts, not from the
 * previous due date, keeps a site that missed several turns (the service was
 * down) from being scanned several times in a row.
 */
export function nextScanAt(schedule: ScanSchedule, from: Date): Date | null {
  return schedule === 'NONE' ? null : new Date(from.getTime() + SCHEDULE_INTERVAL_MS[schedule]);
}

/**
 * The same moment `months` calendar months earlier, in UTC. A day that does
 * not exist in the target month (31 March minus one month) becomes the last
 * day of that month.
 */
export function monthsBefore(date: Date, months: number): Date {
  const target = new Date(date.getTime());
  const day = target.getUTCDate();
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() - months);
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}
