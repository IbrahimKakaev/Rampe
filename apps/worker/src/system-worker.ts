import { PING_JOB, type PingResult, SYSTEM_QUEUE } from '@rampe/shared';
import { type ConnectionOptions, UnrecoverableError, Worker } from 'bullmq';

/** Handles a job of the system queue. An unknown job is a bug: retrying it cannot help. */
export function handleSystemJob(name: string, now: () => Date): PingResult {
  if (name !== PING_JOB) {
    throw new UnrecoverableError(`Unknown job "${name}" on the ${SYSTEM_QUEUE} queue`);
  }
  return { pong: true, handledAt: now().toISOString() };
}

/** Consumes the system queue, which lets the rest of the platform check that a worker is alive. */
export function createSystemWorker(connection: ConnectionOptions): Worker<unknown, PingResult> {
  return new Worker<unknown, PingResult>(
    SYSTEM_QUEUE,
    (job) => Promise.resolve(handleSystemJob(job.name, () => new Date())),
    { connection },
  );
}
