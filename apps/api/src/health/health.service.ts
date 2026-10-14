import { Inject, Injectable, Logger } from '@nestjs/common';
import { buildHealthResponse, type DependencyStatus, type HealthResponse } from '@rampe/shared';

import { DATABASE_PROBE, QUEUE_PROBE, type Probe } from '../infra/probe.js';

/** A dependency that has not answered within this delay is reported as down. */
export const PROBE_TIMEOUT_MS = 2000;

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    @Inject(DATABASE_PROBE) private readonly database: Probe,
    @Inject(QUEUE_PROBE) private readonly queue: Probe,
  ) {}

  async check(): Promise<HealthResponse> {
    const [database, queue] = await Promise.all([
      this.statusOf('database', this.database),
      this.statusOf('queue', this.queue),
    ]);
    return buildHealthResponse({ database, queue });
  }

  private async statusOf(name: string, probe: Probe): Promise<DependencyStatus> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`no answer within ${String(PROBE_TIMEOUT_MS)} ms`));
      }, PROBE_TIMEOUT_MS);
    });
    try {
      await Promise.race([probe.ping(), timeout]);
      return 'up';
    } catch (error) {
      // The reason stays in the logs: the public response only says "down".
      this.logger.warn(
        `${name} is down: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 'down';
    } finally {
      clearTimeout(timer);
    }
  }
}
