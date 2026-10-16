import { Module } from '@nestjs/common';

import { SitesModule } from '../sites/sites.module.js';
import { Maintenance } from './maintenance.js';
import { RegressionAlerts } from './regression-alerts.js';
import { Retention } from './retention.js';
import { ScanEventsConsumer } from './scan-events.consumer.js';
import { ScanRecorder } from './scan-recorder.js';
import { ScansController } from './scans.controller.js';
import { ScansService } from './scans.service.js';
import { ScheduledScans } from './scheduled-scans.js';

@Module({
  imports: [SitesModule],
  controllers: [ScansController],
  providers: [
    ScansService,
    ScanRecorder,
    ScanEventsConsumer,
    RegressionAlerts,
    ScheduledScans,
    Retention,
    Maintenance,
  ],
  exports: [ScanRecorder, ScheduledScans, Retention],
})
export class ScansModule {}
