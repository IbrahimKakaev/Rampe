import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import {
  type ScanJob,
  SCANS_QUEUE,
  SITE_CHECKS_QUEUE,
  type SiteCheckJob,
  type SiteCheckResult,
  siteCheckResultSchema,
} from '@rampe/shared';
import { Queue, QueueEvents } from 'bullmq';

import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { closeWithin } from './shutdown.js';

/** Jobs the API sends to the worker. */
@Injectable()
export class Queues implements OnApplicationShutdown {
  private readonly logger = new Logger(Queues.name);
  readonly scans: Queue<ScanJob>;
  private readonly siteChecks: Queue<SiteCheckJob, SiteCheckResult>;
  private readonly siteCheckEvents: QueueEvents;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    const connection = { url: config.valkeyUrl };
    this.scans = new Queue<ScanJob>(SCANS_QUEUE, {
      connection,
      defaultJobOptions: { attempts: 1, removeOnComplete: 1000, removeOnFail: 1000 },
    });
    this.siteChecks = new Queue<SiteCheckJob, SiteCheckResult>(SITE_CHECKS_QUEUE, {
      connection,
      defaultJobOptions: { attempts: 1, removeOnComplete: 100, removeOnFail: 100 },
    });
    this.siteCheckEvents = new QueueEvents(SITE_CHECKS_QUEUE, { connection });
    // BullMQ reports a lost connection as an 'error' event, then reconnects by
    // itself. Without a listener, Node would treat it as a crash of the API.
    const warn = (name: string) => (error: Error) => {
      this.logger.warn(`Queue ${name}: ${error.message}`);
    };
    this.scans.on('error', warn(SCANS_QUEUE));
    this.siteChecks.on('error', warn(SITE_CHECKS_QUEUE));
    this.siteCheckEvents.on('error', warn(`${SITE_CHECKS_QUEUE} events`));
  }

  async enqueueScan(job: ScanJob): Promise<void> {
    await this.scans.add('scan', job, { jobId: job.scanId });
  }

  /** Asks the worker to fetch a file through the egress proxy, and waits for the answer. */
  async fetchThroughWorker(url: string, timeoutMs: number): Promise<SiteCheckResult> {
    const job = await this.siteChecks.add('fetch', { url });
    return siteCheckResultSchema.parse(
      await job.waitUntilFinished(this.siteCheckEvents, timeoutMs),
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(
      [this.siteCheckEvents, this.siteChecks, this.scans].map((resource) =>
        closeWithin(() => resource.close()).then(() => closeWithin(() => resource.disconnect())),
      ),
    );
  }
}
