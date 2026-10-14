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
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  acceptInvitationRequestSchema,
  createInvitationRequestSchema,
  createOrganizationRequestSchema,
  deleteOrganizationRequestSchema,
  idSchema,
  type Invitation,
  invitationSchema,
  type Member,
  memberSchema,
  type Organization,
  organizationSchema,
  type Role,
  updateMemberRequestSchema,
  updateOrganizationRequestSchema,
} from '@rampe/shared';
import * as z from 'zod/mini';

import {
  CurrentOrganization,
  CurrentUser,
  type OrganizationAccess,
  OwnerOnly,
  type SessionUser,
} from '../security/request-context.js';
import { OrganizationsService } from './organizations.service.js';

@ApiTags('Organisations')
@ApiNotFoundResponse({ description: 'Organisation introuvable, ou dont vous n’êtes pas membre.' })
@Controller()
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get('orgs')
  @ApiOperation({ summary: 'Mes organisations' })
  @ApiOkResponse({ standardSchema: z.array(organizationSchema) })
  list(@CurrentUser() user: SessionUser): Promise<Organization[]> {
    return this.organizations.list(user.id);
  }

  @Post('orgs')
  @ApiOperation({ summary: 'Créer une organisation, dont je deviens propriétaire' })
  @ApiCreatedResponse({ standardSchema: organizationSchema })
  create(
    @CurrentUser() user: SessionUser,
    @Body({ schema: createOrganizationRequestSchema }) body: { name: string },
  ): Promise<Organization> {
    return this.organizations.create(user.id, body.name);
  }

  @Get('orgs/:org')
  @ApiOperation({ summary: 'Une organisation' })
  @ApiOkResponse({ standardSchema: organizationSchema })
  get(@CurrentOrganization() access: OrganizationAccess): Promise<Organization> {
    return this.organizations.get(access.organizationId, access.role);
  }

  @Patch('orgs/:org')
  @OwnerOnly()
  @ApiOperation({
    summary: 'Renommer l’organisation ou changer la durée de conservation des scans',
  })
  @ApiOkResponse({ standardSchema: organizationSchema })
  @ApiForbiddenResponse({ description: 'Réservé aux propriétaires.' })
  update(
    @CurrentOrganization() access: OrganizationAccess,
    @Body({ schema: updateOrganizationRequestSchema })
    body: { name?: string; retentionMonths?: number },
  ): Promise<Organization> {
    return this.organizations.update(access.organizationId, access.role, body);
  }

  @Delete('orgs/:org')
  @OwnerOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer l’organisation et toutes ses données ; mot de passe requis' })
  @ApiNoContentResponse({ description: 'Organisation et données supprimées.' })
  @ApiForbiddenResponse({ description: 'Réservé aux propriétaires, ou mot de passe incorrect.' })
  async delete(
    @CurrentOrganization() access: OrganizationAccess,
    @CurrentUser() user: SessionUser,
    @Body({ schema: deleteOrganizationRequestSchema }) body: { password: string },
  ): Promise<void> {
    await this.organizations.delete(access.organizationId, user, body.password);
  }

  @Get('orgs/:org/members')
  @ApiOperation({ summary: 'Les membres de l’organisation' })
  @ApiOkResponse({ standardSchema: z.array(memberSchema) })
  members(@CurrentOrganization() access: OrganizationAccess): Promise<Member[]> {
    return this.organizations.members(access.organizationId);
  }

  @Patch('orgs/:org/members/:user')
  @OwnerOnly()
  @ApiOperation({ summary: 'Changer le rôle d’un membre' })
  @ApiOkResponse({ standardSchema: memberSchema })
  @ApiConflictResponse({ description: 'L’organisation doit garder au moins un propriétaire.' })
  changeRole(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('user', { schema: idSchema }) userId: string,
    @Body({ schema: updateMemberRequestSchema }) body: { role: Role },
  ): Promise<Member> {
    return this.organizations.changeRole(access.organizationId, userId, body.role);
  }

  @Delete('orgs/:org/members/:user')
  @OwnerOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Retirer un membre' })
  @ApiNoContentResponse({ description: 'Membre retiré.' })
  @ApiConflictResponse({ description: 'L’organisation doit garder au moins un propriétaire.' })
  async removeMember(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('user', { schema: idSchema }) userId: string,
  ): Promise<void> {
    await this.organizations.removeMember(access.organizationId, userId);
  }

  @Get('orgs/:org/invitations')
  @ApiOperation({ summary: 'Les invitations en attente' })
  @ApiOkResponse({ standardSchema: z.array(invitationSchema) })
  invitations(@CurrentOrganization() access: OrganizationAccess): Promise<Invitation[]> {
    return this.organizations.invitations(access.organizationId);
  }

  @Post('orgs/:org/invitations')
  @OwnerOnly()
  @ApiOperation({ summary: 'Inviter une personne par e-mail' })
  @ApiCreatedResponse({ standardSchema: invitationSchema })
  @ApiConflictResponse({ description: 'Déjà membre.' })
  invite(
    @CurrentOrganization() access: OrganizationAccess,
    @CurrentUser() user: SessionUser,
    @Body({ schema: createInvitationRequestSchema }) body: { email: string; role: Role },
  ): Promise<Invitation> {
    return this.organizations.invite(access.organizationId, user, body.email, body.role);
  }

  @Delete('orgs/:org/invitations/:invitation')
  @OwnerOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Annuler une invitation' })
  @ApiNoContentResponse({ description: 'Invitation annulée.' })
  async revokeInvitation(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('invitation', { schema: idSchema }) invitationId: string,
  ): Promise<void> {
    await this.organizations.revokeInvitation(access.organizationId, invitationId);
  }

  @Post('invitations/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accepter une invitation reçue par e-mail' })
  @ApiOkResponse({ standardSchema: organizationSchema })
  acceptInvitation(
    @CurrentUser() user: SessionUser,
    @Body({ schema: acceptInvitationRequestSchema }) body: { token: string },
  ): Promise<Organization> {
    return this.organizations.acceptInvitation(user, body.token);
  }
}
