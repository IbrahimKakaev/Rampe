import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { SCAN_EVENTS_QUEUE, scanEventSchema } from '@rampe/shared';
import { Worker } from 'bullmq';

import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { closeWithin } from '../infra/shutdown.js';
import { ScanRecorder } from './scan-recorder.js';

/** Consumes the scan results the worker publishes. */
@Injectable()
export class ScanEventsConsumer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ScanEventsConsumer.name);
  private worker: Worker | undefined;

  constructor(
    private readonly recorder: ScanRecorder,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    this.worker = new Worker(
      SCAN_EVENTS_QUEUE,
      async (job) => {
        // A message from the worker crosses a trust boundary: it is validated.
        await this.recorder.record(scanEventSchema.parse(job.data));
      },
      { connection: { url: this.config.valkeyUrl }, concurrency: 4 },
    );
    this.worker.on('error', (error) => {
      this.logger.warn(`Scan events: ${error.message}`);
    });
    this.worker.on('failed', (job, error) => {
      this.logger.warn(
        `Scan event ${job?.id ?? '?'} failed (attempt ${String(job?.attemptsMade ?? 0)}): ${error.message}`,
      );
    });
  }

  async onApplicationShutdown(): Promise<void> {
    const worker = this.worker;
    if (worker !== undefined) {
      // A message being recorded is retried by the queue if it does not finish.
      await closeWithin(() => worker.close());
      await closeWithin(() => worker.disconnect());
    }
  }
}
