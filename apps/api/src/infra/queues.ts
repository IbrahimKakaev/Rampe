import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import {
  REPORTS_QUEUE,
  type ReportJob,
  type ReportResult,
  reportResultSchema,
  SCAN_EVENTS_QUEUE,
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

/** Failed jobs are kept a week for the operator, then dropped. */
const KEEP_FAILED = { age: 7 * 24 * 60 * 60, count: 1000 };

/** States of a job that is not being processed, and can therefore be removed. */
const IDLE_STATES = ['wait', 'delayed', 'prioritized', 'failed', 'completed'] as const;

/** Jobs the API sends to the worker. */
@Injectable()
export class Queues implements OnApplicationShutdown {
  private readonly logger = new Logger(Queues.name);
  readonly scans: Queue<ScanJob>;
  /** Read here only to forget the messages of deleted scans; the API consumes them elsewhere. */
  readonly scanEvents: Queue<{ scanId: string }>;
  private readonly siteChecks: Queue<SiteCheckJob, SiteCheckResult>;
  private readonly siteCheckEvents: QueueEvents;
  private readonly reports: Queue<ReportJob, ReportResult>;
  private readonly reportEvents: QueueEvents;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    const connection = { url: config.valkeyUrl };
    // A finished scan job carries nothing worth keeping: its results are in the database.
    this.scans = new Queue<ScanJob>(SCANS_QUEUE, {
      connection,
      defaultJobOptions: { attempts: 1, removeOnComplete: true, removeOnFail: KEEP_FAILED },
    });
    this.scanEvents = new Queue<{ scanId: string }>(SCAN_EVENTS_QUEUE, { connection });
    // A report holds extracts of a customer's pages: the job goes as soon as it is done.
    this.reports = new Queue<ReportJob, ReportResult>(REPORTS_QUEUE, {
      connection,
      defaultJobOptions: { attempts: 1, removeOnComplete: true, removeOnFail: true },
    });
    this.reportEvents = new QueueEvents(REPORTS_QUEUE, { connection });
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
    this.scanEvents.on('error', warn(SCAN_EVENTS_QUEUE));
    this.reports.on('error', warn(REPORTS_QUEUE));
    this.reportEvents.on('error', warn(`${REPORTS_QUEUE} events`));
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

  /** Asks the worker to print a report, and waits for the PDF. */
  async renderPdf(html: string, timeoutMs = 90_000): Promise<Buffer> {
    const job = await this.reports.add('pdf', { html });
    const result = reportResultSchema.parse(
      await job.waitUntilFinished(this.reportEvents, timeoutMs),
    );
    return Buffer.from(result.pdf, 'base64');
  }

  /**
   * Removes every job of these scans that is not running: queued scans, and
   * the messages the worker sent about them. A job being processed cannot be
   * removed; when it ends, its messages find no scan and are dropped.
   * Returns how many jobs were removed.
   */
  async forgetScans(scanIds: ReadonlySet<string>): Promise<number> {
    if (scanIds.size === 0) {
      return 0;
    }
    let removed = 0;
    for (const queue of [this.scans, this.scanEvents]) {
      const jobs = await queue.getJobs([...IDLE_STATES]);
      for (const job of jobs) {
        const scanId = (job.data as { scanId?: unknown } | undefined)?.scanId;
        if (typeof scanId === 'string' && scanIds.has(scanId) && job.id !== undefined) {
          removed += await queue.remove(job.id);
        }
      }
    }
    return removed;
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(
      [
        this.siteCheckEvents,
        this.siteChecks,
        this.reportEvents,
        this.reports,
        this.scanEvents,
        this.scans,
      ].map((resource) =>
        closeWithin(() => resource.close()).then(() => closeWithin(() => resource.disconnect())),
      ),
    );
  }
}
