import { Module } from '@nestjs/common';

import { AuditsController } from './audits.controller.js';
import { AuditsService } from './audits.service.js';
import { ReferentialController } from './referential.controller.js';

@Module({ controllers: [AuditsController, ReferentialController], providers: [AuditsService] })
export class AuditsModule {}
