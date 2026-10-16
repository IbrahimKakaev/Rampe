import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  type Audit,
  auditSampleRequestSchema,
  type AuditSampleRequest,
  auditSchema,
  type AuditSummary,
  auditSummarySchema,
  type Conformity,
  conformitySchema,
  createAuditRequestSchema,
  type CriterionEvaluation,
  criterionEvaluationSchema,
  type EvaluationRequest,
  evaluationRequestSchema,
  idSchema,
  type Statement,
  type StatementFields,
  statementFieldsSchema,
  statementSchema,
} from '@rampe/shared';
import * as z from 'zod/mini';

import {
  CurrentOrganization,
  CurrentUser,
  type OrganizationAccess,
  type SessionUser,
} from '../security/request-context.js';
import { AuditsService } from './audits.service.js';

const criterionParamSchema = z.string().check(z.regex(/^\d{1,2}\.\d{1,2}$/));

@ApiTags('Audit manuel')
@ApiNotFoundResponse({ description: 'Organisation, site, audit, page ou critère introuvable.' })
@Controller('orgs/:org')
export class AuditsController {
  constructor(private readonly audits: AuditsService) {}

  @Post('sites/:site/audits')
  @ApiOperation({ summary: 'Commencer un audit manuel à partir d’un scan terminé du site' })
  @ApiCreatedResponse({ standardSchema: auditSchema })
  @ApiConflictResponse({ description: 'Le scan n’est pas terminé.' })
  create(
    @CurrentOrganization() access: OrganizationAccess,
    @CurrentUser() user: SessionUser,
    @Param('site', { schema: idSchema }) siteId: string,
    @Body({ schema: createAuditRequestSchema }) body: { scanId: string },
  ): Promise<Audit> {
    return this.audits.create(access.organizationId, siteId, body.scanId, user);
  }

  @Get('sites/:site/audits')
  @ApiOperation({ summary: 'Les audits manuels du site, du plus récent au plus ancien' })
  @ApiOkResponse({ standardSchema: z.array(auditSummarySchema) })
  list(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('site', { schema: idSchema }) siteId: string,
  ): Promise<AuditSummary[]> {
    return this.audits.list(access.organizationId, siteId);
  }

  @Get('audits/:audit')
  @ApiOperation({
    summary: 'Un audit : son échantillon, son avancement et, s’il est complet, ses taux',
  })
  @ApiOkResponse({ standardSchema: auditSchema })
  get(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('audit', { schema: idSchema }) auditId: string,
  ): Promise<Audit> {
    return this.audits.get(access.organizationId, auditId);
  }

  @Put('audits/:audit/pages')
  @ApiOperation({
    summary:
      'Composer l’échantillon ; une page gardée garde ses évaluations, une page nouvelle du scan reçoit les propositions automatiques',
  })
  @ApiOkResponse({ standardSchema: auditSchema })
  @ApiBadRequestResponse({ description: 'Échantillon invalide.' })
  sample(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('audit', { schema: idSchema }) auditId: string,
    @Body({ schema: auditSampleRequestSchema }) body: AuditSampleRequest,
  ): Promise<Audit> {
    return this.audits.setSample(access.organizationId, auditId, body);
  }

  @Get('audits/:audit/pages/:page/criteria')
  @ApiOperation({ summary: 'La grille des 106 critères d’une page de l’échantillon' })
  @ApiOkResponse({ standardSchema: z.array(criterionEvaluationSchema) })
  criteria(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('audit', { schema: idSchema }) auditId: string,
    @Param('page', { schema: idSchema }) pageId: string,
  ): Promise<CriterionEvaluation[]> {
    return this.audits.criteria(access.organizationId, auditId, pageId);
  }

  @Put('audits/:audit/pages/:page/criteria/:criterion')
  @ApiOperation({
    summary:
      'Donner le statut d’un critère sur une page, avec une note ; infirmer un défaut détecté demande une note',
  })
  @ApiOkResponse({ standardSchema: criterionEvaluationSchema })
  @ApiBadRequestResponse({
    description: 'Statut invalide, ou note manquante pour infirmer un défaut.',
  })
  evaluate(
    @CurrentOrganization() access: OrganizationAccess,
    @CurrentUser() user: SessionUser,
    @Param('audit', { schema: idSchema }) auditId: string,
    @Param('page', { schema: idSchema }) pageId: string,
    @Param('criterion', { schema: criterionParamSchema }) criterion: string,
    @Body({ schema: evaluationRequestSchema }) body: EvaluationRequest,
  ): Promise<CriterionEvaluation> {
    return this.audits.evaluate(access.organizationId, auditId, pageId, criterion, body, user);
  }

  @Get('audits/:audit/conformity')
  @ApiOperation({
    summary:
      'Le taux de conformité RGAA et le taux moyen, selon la méthode officielle, si l’audit est complet ; l’avancement sinon',
  })
  @ApiOkResponse({ standardSchema: conformitySchema })
  conformity(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('audit', { schema: idSchema }) auditId: string,
  ): Promise<Conformity> {
    return this.audits.conformity(access.organizationId, auditId);
  }

  @Get('audits/:audit/statement')
  @ApiOperation({
    summary: 'La déclaration d’accessibilité, brouillon tant que l’audit n’est pas complet',
  })
  @ApiOkResponse({ standardSchema: statementSchema })
  statement(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('audit', { schema: idSchema }) auditId: string,
  ): Promise<Statement> {
    return this.audits.statement(access.organizationId, auditId);
  }

  @Put('audits/:audit/statement')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Compléter la déclaration : entité, contact, environnement de test…' })
  @ApiOkResponse({ standardSchema: statementSchema })
  saveStatement(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('audit', { schema: idSchema }) auditId: string,
    @Body({ schema: statementFieldsSchema }) body: StatementFields,
  ): Promise<Statement> {
    return this.audits.saveStatement(access.organizationId, auditId, body);
  }
}
