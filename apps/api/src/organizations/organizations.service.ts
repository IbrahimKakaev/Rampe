import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type Invitation,
  LINK_TOKEN_PARAMETER,
  type Member,
  type Organization,
  type Role,
  webPath,
} from '@rampe/shared';

import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { Mailer } from '../infra/mailer.js';
import { Prisma } from '../infra/prisma.js';
import { invitationEmail } from '../mail/templates.js';
import type { SessionUser } from '../security/request-context.js';
import { hashToken, newToken, verifyPassword } from '../security/secrets.js';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: Prisma,
    private readonly mailer: Mailer,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async list(userId: string): Promise<Organization[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map(({ organization, role }) => toOrganization(organization, role));
  }

  async create(userId: string, name: string): Promise<Organization> {
    const organization = await this.prisma.organization.create({
      data: { name, memberships: { create: { userId, role: 'OWNER' } } },
    });
    return toOrganization(organization, 'OWNER');
  }

  async get(organizationId: string, role: Role): Promise<Organization> {
    return toOrganization(
      await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
      role,
    );
  }

  async update(
    organizationId: string,
    role: Role,
    changes: { name?: string | undefined; retentionMonths?: number | undefined },
  ): Promise<Organization> {
    const organization = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...(changes.name === undefined ? {} : { name: changes.name }),
        ...(changes.retentionMonths === undefined
          ? {}
          : { retentionMonths: changes.retentionMonths }),
      },
    });
    return toOrganization(organization, role);
  }

  /**
   * Deletes the organisation and, by cascade, everything that belongs to it:
   * members, invitations, sites, scans, pages and defects. The owner confirms
   * with their password.
   */
  async delete(organizationId: string, user: SessionUser, password: string): Promise<void> {
    const account = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await verifyPassword(account.passwordHash, password))) {
      throw new ForbiddenException('Mot de passe incorrect.');
    }
    await this.prisma.organization.delete({ where: { id: organizationId } });
  }

  async members(organizationId: string): Promise<Member[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { organizationId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((membership) => ({
      userId: membership.userId,
      email: membership.user.email,
      name: membership.user.name,
      role: membership.role,
      joinedAt: membership.createdAt.toISOString(),
    }));
  }

  async changeRole(organizationId: string, userId: string, role: Role): Promise<Member> {
    await this.findMember(organizationId, userId);
    if (role === 'MEMBER') {
      await this.keepAnOwner(organizationId, userId);
    }
    await this.prisma.membership.update({
      where: { userId_organizationId: { userId, organizationId } },
      data: { role },
    });
    const member = (await this.members(organizationId)).find(
      (candidate) => candidate.userId === userId,
    );
    if (member === undefined) {
      throw new NotFoundException('Membre introuvable');
    }
    return member;
  }

  async removeMember(organizationId: string, userId: string): Promise<void> {
    await this.findMember(organizationId, userId);
    await this.keepAnOwner(organizationId, userId);
    await this.prisma.membership.delete({
      where: { userId_organizationId: { userId, organizationId } },
    });
  }

  async invitations(organizationId: string): Promise<Invitation[]> {
    const invitations = await this.prisma.invitation.findMany({
      where: { organizationId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
    });
    return invitations.map(toInvitation);
  }

  async invite(
    organizationId: string,
    inviter: SessionUser,
    email: string,
    role: Role,
  ): Promise<Invitation> {
    const alreadyMember = await this.prisma.membership.findFirst({
      where: { organizationId, user: { email } },
    });
    if (alreadyMember !== null) {
      throw new ConflictException('Cette personne est déjà membre de l’organisation.');
    }
    const token = newToken();
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    const invitation = await this.prisma.invitation.create({
      data: {
        organizationId,
        email,
        role,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
    });
    await this.mailer.send(
      invitationEmail(
        email,
        organization.name,
        inviter.name,
        `${this.config.publicUrl}${webPath('acceptInvitation')}?${LINK_TOKEN_PARAMETER}=${encodeURIComponent(token)}`,
      ),
    );
    return toInvitation(invitation);
  }

  async revokeInvitation(organizationId: string, invitationId: string): Promise<void> {
    const revoked = await this.prisma.invitation.deleteMany({
      where: { id: invitationId, organizationId },
    });
    if (revoked.count === 0) {
      throw new NotFoundException('Invitation introuvable');
    }
  }

  /** The invitation is personal: only the account with the invited address may accept it. */
  async acceptInvitation(user: SessionUser, token: string): Promise<Organization> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (invitation?.acceptedAt !== null || invitation.expiresAt <= new Date()) {
      throw new BadRequestException('Cette invitation est invalide ou a expiré.');
    }
    if (invitation.email !== user.email) {
      throw new ForbiddenException('Cette invitation a été envoyée à une autre adresse.');
    }
    await this.prisma.$transaction([
      this.prisma.membership.upsert({
        where: {
          userId_organizationId: { userId: user.id, organizationId: invitation.organizationId },
        },
        create: {
          userId: user.id,
          organizationId: invitation.organizationId,
          role: invitation.role,
        },
        update: {},
      }),
      this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      }),
    ]);
    const membership = await this.prisma.membership.findUniqueOrThrow({
      where: {
        userId_organizationId: { userId: user.id, organizationId: invitation.organizationId },
      },
      include: { organization: true },
    });
    return toOrganization(membership.organization, membership.role);
  }

  private async findMember(organizationId: string, userId: string): Promise<void> {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
    if (membership === null) {
      throw new NotFoundException('Membre introuvable');
    }
  }

  /** An organisation always keeps at least one owner. */
  private async keepAnOwner(organizationId: string, leavingUserId: string): Promise<void> {
    const otherOwners = await this.prisma.membership.count({
      where: { organizationId, role: 'OWNER', userId: { not: leavingUserId } },
    });
    if (otherOwners === 0) {
      throw new ConflictException('L’organisation doit garder au moins un propriétaire.');
    }
  }
}

function toOrganization(
  organization: { id: string; name: string; retentionMonths: number; createdAt: Date },
  role: Role,
): Organization {
  return {
    id: organization.id,
    name: organization.name,
    role,
    retentionMonths: organization.retentionMonths,
    createdAt: organization.createdAt.toISOString(),
  };
}

function toInvitation(invitation: {
  id: string;
  email: string;
  role: Role;
  expiresAt: Date;
  createdAt: Date;
}): Invitation {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
  };
}
