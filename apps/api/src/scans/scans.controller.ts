import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  findingDetailSchema,
  findingsPageSchema,
  findingsQuerySchema,
  findingsSummarySchema,
  idSchema,
  type Scan,
  scanComparisonSchema,
  scanPageSchema,
  scanSchema,
} from '@rampe/shared';
import * as z from 'zod/mini';

import { CurrentOrganization, type OrganizationAccess } from '../security/request-context.js';
import { type FindingFilters, ScansService } from './scans.service.js';

@ApiTags('Scans')
@ApiNotFoundResponse({ description: 'Organisation, site, scan ou défaut introuvable.' })
@Controller('orgs/:org')
export class ScansController {
  constructor(private readonly scans: ScansService) {}

  @Post('sites/:site/scans')
  @ApiOperation({
    summary: 'Lancer un scan du site ; la preuve de propriété est vérifiée de nouveau',
  })
  @ApiCreatedResponse({ standardSchema: scanSchema })
  @ApiConflictResponse({ description: 'Site non vérifié, preuve disparue, ou scan déjà en cours.' })
  start(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('site', { schema: idSchema }) siteId: string,
  ): Promise<Scan> {
    return this.scans.start(access.organizationId, siteId);
  }

  @Get('sites/:site/scans')
  @ApiOperation({ summary: 'L’historique des scans du site, du plus récent au plus ancien' })
  @ApiOkResponse({ standardSchema: z.array(scanSchema) })
  list(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('site', { schema: idSchema }) siteId: string,
  ): Promise<Scan[]> {
    return this.scans.list(access.organizationId, siteId);
  }

  @Get('scans/:scan')
  @ApiOperation({
    summary: 'Un scan : état, score de pré-audit, nombre de critères à vérifier à la main',
  })
  @ApiOkResponse({ standardSchema: scanSchema })
  get(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('scan', { schema: idSchema }) scanId: string,
  ): Promise<Scan> {
    return this.scans.get(access.organizationId, scanId);
  }

  @Get('scans/:scan/pages')
  @ApiOperation({ summary: 'Les pages visitées par le scan' })
  @ApiOkResponse({ standardSchema: z.array(scanPageSchema) })
  pages(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('scan', { schema: idSchema }) scanId: string,
  ) {
    return this.scans.pages(access.organizationId, scanId);
  }

  @Get('scans/:scan/findings')
  @ApiOperation({
    summary: 'Les défauts du scan, filtrés par règle, critère RGAA, gravité ou page',
  })
  @ApiOkResponse({ standardSchema: findingsPageSchema })
  findings(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('scan', { schema: idSchema }) scanId: string,
    @Query({ schema: findingsQuerySchema }) query: FindingFilters,
  ) {
    return this.scans.findings(access.organizationId, scanId, query);
  }

  @Get('scans/:scan/findings/summary')
  @ApiOperation({ summary: 'Le nombre de défauts par critère RGAA, par gravité et par page' })
  @ApiOkResponse({ standardSchema: findingsSummarySchema })
  summary(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('scan', { schema: idSchema }) scanId: string,
  ) {
    return this.scans.summary(access.organizationId, scanId);
  }

  @Get('scans/:scan/findings/:finding')
  @ApiOperation({ summary: 'Un défaut, avec sa correction expliquée en français' })
  @ApiOkResponse({ standardSchema: findingDetailSchema })
  finding(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('scan', { schema: idSchema }) scanId: string,
    @Param('finding', { schema: idSchema }) findingId: string,
  ) {
    return this.scans.finding(access.organizationId, scanId, findingId);
  }

  @Get('scans/:scan/diff')
  @ApiOperation({ summary: 'Les défauts apparus et corrigés depuis le scan précédent du site' })
  @ApiOkResponse({ standardSchema: scanComparisonSchema })
  comparison(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('scan', { schema: idSchema }) scanId: string,
  ) {
    return this.scans.comparison(access.organizationId, scanId);
  }
}
