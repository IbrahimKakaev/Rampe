import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Redis } from 'ioredis';

import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import type { Probe } from './probe.js';

/** How long startup waits for the first connection before serving anyway. */
const CONNECT_GRACE_MS = 2000;

/** Connection to Valkey, which holds the job queues shared with the worker. */
@Injectable()
export class QueueConnection implements Probe, OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(QueueConnection.name);
  private readonly client: Redis;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = new Redis(config.valkeyUrl, {
      // Fail commands at once while disconnected instead of queueing them:
      // a health check must report "down", not wait for the connection to return.
      enableOfflineQueue: false,
      connectTimeout: 2000,
    });
    this.client.on('error', (error) => {
      this.logger.warn(`Valkey connection error: ${error.message}`);
    });
  }

  /**
   * Commands fail until the connection is established, so the API waits for it
   * before accepting requests. If Valkey is unreachable the API still starts,
   * and reports the queue as down.
   */
  async onApplicationBootstrap(): Promise<void> {
    if (this.client.status === 'ready') {
      return;
    }
    await new Promise<void>((resolve) => {
      const settle = (): void => {
        clearTimeout(timer);
        this.client.off('ready', settle);
        resolve();
      };
      const timer = setTimeout(settle, CONNECT_GRACE_MS);
      this.client.once('ready', settle);
    });
  }

  async ping(): Promise<void> {
    await this.client.ping();
  }

  /** Runs a Lua script atomically on Valkey. */
  eval(
    script: string,
    keys: readonly string[],
    args: readonly (string | number)[],
  ): Promise<unknown> {
    return this.client.eval(script, keys.length, ...keys, ...args);
  }

  onApplicationShutdown(): void {
    this.client.disconnect();
  }
}
