import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';

import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import type { Probe } from './probe.js';

/** PostgreSQL connection pool. Prisma takes over data access in milestone J3. */
@Injectable()
export class Database implements Probe, OnApplicationShutdown {
  private readonly logger = new Logger(Database.name);
  private readonly pool: Pool;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      connectionTimeoutMillis: 2000,
      max: 5,
    });
    // Without a listener, an error on an idle client would crash the process.
    this.pool.on('error', (error) => {
      this.logger.warn(`Idle PostgreSQL client error: ${error.message}`);
    });
  }

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
