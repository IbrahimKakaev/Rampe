import { Module } from '@nestjs/common';

import { OwnershipVerifier, SystemTxtResolver, TxtResolver } from './ownership.js';
import { SitesController } from './sites.controller.js';
import { SitesService } from './sites.service.js';

@Module({
  controllers: [SitesController],
  providers: [
    SitesService,
    OwnershipVerifier,
    { provide: TxtResolver, useClass: SystemTxtResolver },
  ],
  exports: [SitesService],
})
export class SitesModule {}
