import { Module } from '@nestjs/common';

import { SitesModule } from '../sites/sites.module.js';
import { ScanEventsConsumer } from './scan-events.consumer.js';
import { ScanRecorder } from './scan-recorder.js';
import { ScansController } from './scans.controller.js';
import { ScansService } from './scans.service.js';

@Module({
  imports: [SitesModule],
  controllers: [ScansController],
  providers: [ScansService, ScanRecorder, ScanEventsConsumer],
  exports: [ScanRecorder],
})
export class ScansModule {}
