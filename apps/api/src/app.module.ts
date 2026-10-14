import { type DynamicModule, Module } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from './config/app-config.js';
import { HealthModule } from './health/health.module.js';

@Module({})
export class AppModule {
  /** The configuration is passed in rather than read from `process.env`, so tests control it. */
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [HealthModule],
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}
