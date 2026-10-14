import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { PING_JOB, pingResultSchema, SYSTEM_QUEUE } from '@rampe/shared';
import { Queue, QueueEvents, type Worker } from 'bullmq';

import { type StartedDependency, startValkey } from '../../../test-support/containers.js';
import { createSystemWorker } from '../src/system-worker.js';

/**
 * Valkey replaces Redis in this project (see DECISIONS.md). BullMQ is developed
 * against Redis, so these tests prove on a real Valkey server the three features
 * the product relies on: immediate jobs, delayed jobs and scheduled jobs.
 */
describe('BullMQ on Valkey', () => {
  let valkey: StartedDependency;
  let queue: Queue;
  let events: QueueEvents;
  let worker: Worker;

  beforeAll(async () => {
    valkey = await startValkey();
    const connection = { url: valkey.url };
    queue = new Queue(SYSTEM_QUEUE, { connection });
    events = new QueueEvents(SYSTEM_QUEUE, { connection });
    worker = createSystemWorker(connection);
    await Promise.all([queue.waitUntilReady(), events.waitUntilReady(), worker.waitUntilReady()]);
  });

  afterAll(async () => {
    await Promise.all([worker.close(), events.close(), queue.close()]);
    await valkey.container.stop();
  });

  it('runs on the Valkey version pinned in docker-compose.yml', async () => {
    const { output } = await valkey.container.exec(['valkey-server', '--version']);

    expect(output).toMatch(/Valkey server v=9\./);
  });

  it('processes a job and returns its result to the producer', async () => {
    const job = await queue.add(PING_JOB, {});

    const result: unknown = await job.waitUntilFinished(events, 10_000);

    expect(pingResultSchema.safeParse(result).success).toBe(true);
  });

  it('holds a delayed job until its delay has passed', async () => {
    const delay = 1500;
    const job = await queue.add(PING_JOB, {}, { delay });

    await job.waitUntilFinished(events, 10_000);

    const finished = await queue.getJob(job.id ?? '');
    expect(finished?.processedOn).toBeGreaterThanOrEqual(job.timestamp + delay);
  });

  it('runs a scheduled job repeatedly until the schedule is removed', async () => {
    const schedulerId = 'ping-every-second';
    const handled: string[] = [];
    const onCompleted = ({ jobId }: { jobId: string }): void => {
      if (jobId.startsWith(`repeat:${schedulerId}:`)) {
        handled.push(jobId);
      }
    };
    events.on('completed', onCompleted);

    await queue.upsertJobScheduler(schedulerId, { every: 1000 }, { name: PING_JOB });
    await waitFor(() => handled.length >= 3, 15_000);
    expect(await queue.removeJobScheduler(schedulerId)).toBe(true);

    // Let the run that was already planned finish, then check that nothing follows.
    await sleep(1500);
    const settled = handled.length;
    await sleep(2500);
    events.off('completed', onCompleted);

    expect(new Set(handled).size).toBe(handled.length);
    expect(handled.length).toBe(settled);
  });

  it('fails an unknown job once, without retrying it', async () => {
    const job = await queue.add('reticulate-splines', {}, { attempts: 5 });

    await expect(job.waitUntilFinished(events, 10_000)).rejects.toThrow('reticulate-splines');

    const failed = await queue.getJob(job.id ?? '');
    expect(failed?.attemptsMade).toBe(1);
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(condition: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`Condition not met within ${String(timeoutMs)} ms`);
    }
    await sleep(100);
  }
}
