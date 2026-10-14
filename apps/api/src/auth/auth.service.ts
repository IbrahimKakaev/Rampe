import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { LoginRequest, Me, RegisterRequest } from '@rampe/shared';

import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { Mailer } from '../infra/mailer.js';
import { Prisma } from '../infra/prisma.js';
import { accountExistsEmail, passwordResetEmail, verificationEmail } from '../mail/templates.js';
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  hashToken,
  newToken,
  verifyPassword,
} from '../security/secrets.js';
import { Sessions } from '../security/sessions.js';

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const INVALID_LINK = 'Ce lien est invalide ou a expiré.';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: Prisma,
    private readonly sessions: Sessions,
    private readonly mailer: Mailer,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Creates the account and its organisation, and sends the verification link.
   * The answer is the same whether the address is new or not: a registration
   * form must not tell who has an account. A known address receives a reminder.
   */
  async register(input: RegisterRequest): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing !== null) {
      await this.mailer.send(accountExistsEmail(input.email, this.link('/mot-de-passe-oublie')));
      return;
    }
    const passwordHash = await hashPassword(input.password);
    const token = newToken();
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: input.email, name: input.name, passwordHash },
      });
      await tx.organization.create({
        data: {
          name: input.organizationName,
          memberships: { create: { userId: user.id, role: 'OWNER' } },
        },
      });
      await tx.authToken.create({
        data: {
          tokenHash: hashToken(token),
          userId: user.id,
          type: 'EMAIL_VERIFICATION',
          expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
        },
      });
    });
    await this.mailer.send(
      verificationEmail(input.email, input.name, this.link('/verifier-email', token)),
    );
  }

  async verifyEmail(token: string): Promise<void> {
    const record = await this.consumeToken(token, 'EMAIL_VERIFICATION');
    await this.prisma.user.updateMany({
      where: { id: record.userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });
  }

  /** Checks the credentials and opens a session. Unknown addresses take as long as known ones. */
  async login(input: LoginRequest): Promise<{ token: string; expiresAt: Date; userId: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const valid = await verifyPassword(
      user?.passwordHash ?? (await DUMMY_PASSWORD_HASH),
      input.password,
    );
    if (user === null || !valid) {
      throw new UnauthorizedException('Adresse e-mail ou mot de passe incorrect.');
    }
    if (user.emailVerifiedAt === null) {
      throw new ForbiddenException('Confirmez d’abord votre adresse e-mail avec le lien reçu.');
    }
    return { ...(await this.sessions.open(user.id)), userId: user.id };
  }

  async me(userId: string): Promise<Me> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { memberships: { include: { organization: true }, orderBy: { createdAt: 'asc' } } },
    });
    return {
      user: { id: user.id, email: user.email, name: user.name },
      organizations: user.memberships.map((membership) => ({
        id: membership.organization.id,
        name: membership.organization.name,
        role: membership.role,
      })),
    };
  }

  /** Sends a reset link if the account exists; answers the same either way. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user === null) {
      return;
    }
    const token = newToken();
    await this.prisma.authToken.create({
      data: {
        tokenHash: hashToken(token),
        userId: user.id,
        type: 'PASSWORD_RESET',
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });
    await this.mailer.send(
      passwordResetEmail(email, this.link('/reinitialiser-mot-de-passe', token)),
    );
  }

  /**
   * Sets the new password and closes every session. Following the link proves
   * the address too, so an unverified account becomes verified.
   */
  async resetPassword(token: string, password: string): Promise<void> {
    const record = await this.consumeToken(token, 'PASSWORD_RESET');
    const now = new Date();
    await this.prisma.user.update({
      where: { id: record.userId },
      data: {
        passwordHash: await hashPassword(password),
        emailVerifiedAt: record.user.emailVerifiedAt ?? now,
      },
    });
    await this.sessions.closeAllFor(record.userId);
  }

  /** Marks a single-use token as used, or refuses it. */
  private async consumeToken(token: string, type: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET') {
    const now = new Date();
    const record = await this.prisma.authToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (record?.type !== type || record.usedAt !== null || record.expiresAt <= now) {
      throw new BadRequestException(INVALID_LINK);
    }
    // The condition on usedAt makes the update fail if two requests race for the same token.
    const used = await this.prisma.authToken.updateMany({
      where: { tokenHash: record.tokenHash, usedAt: null },
      data: { usedAt: now },
    });
    if (used.count !== 1) {
      throw new BadRequestException(INVALID_LINK);
    }
    return record;
  }

  private link(path: string, token?: string): string {
    return `${this.config.publicUrl}${path}${token === undefined ? '' : `?jeton=${encodeURIComponent(token)}`}`;
  }
}
