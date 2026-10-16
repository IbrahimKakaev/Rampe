import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';

import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { closeWithin } from '../infra/shutdown.js';
import { Retention } from './retention.js';
import { ScheduledScans } from './scheduled-scans.js';

/** API → API: the periodic tasks. Several API instances share them through the queue. */
export const MAINTENANCE_QUEUE = 'maintenance';
const SCHEDULED_SCANS = 'scheduled-scans';
const RETENTION = 'retention';

/**
 * Runs the periodic tasks with BullMQ job schedulers: the due scans every
 * minute, the purge of old scans every night. A scheduler is stored once in
 * Valkey whatever the number of API instances, and each run goes to one of them.
 */
@Injectable()
export class Maintenance implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(Maintenance.name);
  private queue: Queue | undefined;
  private worker: Worker | undefined;

  constructor(
    private readonly scheduledScans: ScheduledScans,
    private readonly retention: Retention,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const connection = { url: this.config.valkeyUrl };
    this.queue = new Queue(MAINTENANCE_QUEUE, {
      connection,
      defaultJobOptions: { removeOnComplete: true, removeOnFail: 100 },
    });
    this.queue.on('error', (error) => {
      this.logger.warn(`Maintenance queue: ${error.message}`);
    });
    this.worker = new Worker(
      MAINTENANCE_QUEUE,
      async (job) => {
        if (job.name === SCHEDULED_SCANS) {
          await this.scheduledScans.runDue();
        } else if (job.name === RETENTION) {
          await this.retention.purge();
        }
      },
      { connection, concurrency: 1 },
    );
    this.worker.on('error', (error) => {
      this.logger.warn(`Maintenance: ${error.message}`);
    });
    this.worker.on('failed', (job, error) => {
      this.logger.error(`Maintenance task ${job?.name ?? '?'} failed: ${error.message}`);
    });
    try {
      await this.queue.upsertJobScheduler(
        SCHEDULED_SCANS,
        { every: 60_000 },
        { name: SCHEDULED_SCANS },
      );
      await this.queue.upsertJobScheduler(
        RETENTION,
        { pattern: '0 3 * * *', tz: 'Europe/Paris' },
        { name: RETENTION },
      );
    } catch (error) {
      // Valkey unreachable at start: the health check reports it, the next start retries.
      this.logger.error(
        `Periodic tasks not scheduled: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    for (const resource of [this.worker, this.queue]) {
      if (resource !== undefined) {
        await closeWithin(() => resource.close());
        await closeWithin(() => resource.disconnect());
      }
    }
  }
}
