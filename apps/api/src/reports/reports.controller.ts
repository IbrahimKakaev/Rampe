import { Controller, Get, Param, StreamableFile } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { idSchema } from '@rampe/shared';

import { CurrentOrganization, type OrganizationAccess } from '../security/request-context.js';
import { ReportsService } from './reports.service.js';

@ApiTags('Rapports')
@Controller('orgs/:org/scans/:scan')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('report.pdf')
  @ApiOperation({
    summary:
      'Le rapport de pré-audit automatique du scan, en PDF balisé : page de garde, synthèse, défauts par critère, critères à vérifier manuellement, date et périmètre',
  })
  @ApiProduces('application/pdf')
  @ApiOkResponse({
    description: 'Le rapport, produit à la demande et jamais conservé.',
    content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } },
  })
  @ApiNotFoundResponse({ description: 'Organisation ou scan introuvable.' })
  @ApiConflictResponse({ description: 'Le scan n’est pas terminé.' })
  async report(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('scan', { schema: idSchema }) scanId: string,
  ): Promise<StreamableFile> {
    const { pdf, filename } = await this.reports.pdf(access.organizationId, scanId);
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
      length: pdf.length,
    });
  }
}
