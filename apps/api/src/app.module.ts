import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AuditsModule } from './audits/audits.module.js';
import { AuthModule } from './auth/auth.module.js';
import { APP_CONFIG, type AppConfig } from './config/app-config.js';
import { HealthModule } from './health/health.module.js';
import { InfraModule } from './infra/infra.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { ScansModule } from './scans/scans.module.js';
import { OrganizationGuard } from './security/organization.guard.js';
import { ReportsModule } from './reports/reports.module.js';
import { RateLimitGuard } from './security/rate-limit.js';
import { SecurityModule } from './security/security.module.js';
import { SessionGuard } from './security/session.guard.js';
import { SitesModule } from './sites/sites.module.js';

@Module({})
export class AppModule {
  /** The configuration is passed in rather than read from `process.env`, so tests control it. */
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        InfraModule,
        SecurityModule,
        HealthModule,
        AuthModule,
        OrganizationsModule,
        SitesModule,
        ScansModule,
        ReportsModule,
        AuditsModule,
      ],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        // Order matters: count the request, identify the user, then check the organisation.
        { provide: APP_GUARD, useClass: RateLimitGuard },
        { provide: APP_GUARD, useClass: SessionGuard },
        { provide: APP_GUARD, useClass: OrganizationGuard },
      ],
      exports: [APP_CONFIG],
    };
  }
}
