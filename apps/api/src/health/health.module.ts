import { Module } from '@nestjs/common';

import { InfraModule } from '../infra/infra.module.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

@Module({
  imports: [InfraModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
