import * as z from 'zod/mini';

/** Queue used for liveness checks between the API and the worker. */
export const SYSTEM_QUEUE = 'system';
export const PING_JOB = 'ping';

export const pingResultSchema = z.strictObject({
  pong: z.literal(true),
  /** ISO 8601 timestamp taken by the worker when it handled the job. */
  handledAt: z.iso.datetime(),
});
export type PingResult = z.infer<typeof pingResultSchema>;
