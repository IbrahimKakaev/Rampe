import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  createSiteRequestSchema,
  idSchema,
  type Site,
  siteSchema,
  updateSiteRequestSchema,
  verificationCheckRequestSchema,
  verificationInstructionsSchema,
  type VerificationResult,
  verificationResultSchema,
} from '@rampe/shared';
import * as z from 'zod/mini';

import {
  CurrentOrganization,
  type OrganizationAccess,
  OwnerOnly,
} from '../security/request-context.js';
import { SitesService } from './sites.service.js';

@ApiTags('Sites')
@ApiNotFoundResponse({ description: 'Organisation ou site introuvable.' })
@Controller('orgs/:org/sites')
export class SitesController {
  constructor(private readonly sites: SitesService) {}

  @Get()
  @ApiOperation({ summary: 'Les sites de l’organisation, avec leur dernier score et sa tendance' })
  @ApiOkResponse({ standardSchema: z.array(siteSchema) })
  list(@CurrentOrganization() access: OrganizationAccess): Promise<Site[]> {
    return this.sites.list(access.organizationId);
  }

  @Post()
  @ApiOperation({ summary: 'Ajouter un site par l’adresse de sa page d’accueil' })
  @ApiCreatedResponse({ standardSchema: siteSchema })
  @ApiConflictResponse({ description: 'Site déjà enregistré, ou adresse refusée.' })
  create(
    @CurrentOrganization() access: OrganizationAccess,
    @Body({ schema: createSiteRequestSchema }) body: { url: string },
  ): Promise<Site> {
    return this.sites.create(access.organizationId, body.url);
  }

  @Get(':site')
  @ApiOperation({ summary: 'Un site' })
  @ApiOkResponse({ standardSchema: siteSchema })
  get(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('site', { schema: idSchema }) siteId: string,
  ): Promise<Site> {
    return this.sites.get(access.organizationId, siteId);
  }

  @Patch(':site')
  @ApiOperation({ summary: 'Changer la limite de pages ou la planification des scans' })
  @ApiOkResponse({ standardSchema: siteSchema })
  update(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('site', { schema: idSchema }) siteId: string,
    @Body({ schema: updateSiteRequestSchema })
    body: { maxPages?: number; schedule?: 'NONE' | 'DAILY' | 'WEEKLY' },
  ): Promise<Site> {
    return this.sites.update(access.organizationId, siteId, body);
  }

  @Delete(':site')
  @OwnerOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer un site et ses scans' })
  @ApiNoContentResponse({ description: 'Site supprimé.' })
  async delete(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('site', { schema: idSchema }) siteId: string,
  ): Promise<void> {
    await this.sites.delete(access.organizationId, siteId);
  }

  @Get(':site/verification')
  @ApiOperation({ summary: 'Le jeton à publier pour prouver que le site vous appartient' })
  @ApiOkResponse({ standardSchema: verificationInstructionsSchema })
  instructions(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('site', { schema: idSchema }) siteId: string,
  ) {
    return this.sites.instructions(access.organizationId, siteId);
  }

  @Post(':site/verification/check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Vérifier la preuve publiée, par DNS ou par fichier' })
  @ApiOkResponse({ standardSchema: verificationResultSchema })
  verify(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('site', { schema: idSchema }) siteId: string,
    @Body({ schema: verificationCheckRequestSchema }) body: { method: 'DNS' | 'FILE' },
  ): Promise<VerificationResult> {
    return this.sites.verify(access.organizationId, siteId, body.method);
  }
}
