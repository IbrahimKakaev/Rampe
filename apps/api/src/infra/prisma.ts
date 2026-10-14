import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { PrismaClient } from '../generated/prisma/client.js';
import type { Probe } from './probe.js';
import { closeWithin } from './shutdown.js';

/** Access to PostgreSQL. Every query on organisation data must filter on organizationId. */
@Injectable()
export class Prisma extends PrismaClient implements Probe, OnApplicationShutdown {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({
      adapter: new PrismaPg({
        connectionString: config.databaseUrl,
        connectionTimeoutMillis: 2000,
      }),
    });
  }

  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }

  async onApplicationShutdown(): Promise<void> {
    await closeWithin(() => this.$disconnect());
  }
}
