import { Injectable } from '@nestjs/common';

import { Prisma } from '../infra/prisma.js';
import type { SessionUser } from './request-context.js';
import { hashToken, newToken } from './secrets.js';

export const SESSION_COOKIE = 'rampe_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class Sessions {
  constructor(private readonly prisma: Prisma) {}

  /** Opens a session and returns the token for the cookie. Only its hash is stored. */
  async open(userId: string, now = new Date()): Promise<{ token: string; expiresAt: Date }> {
    const token = newToken();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await this.prisma.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
    return { token, expiresAt };
  }

  async resolve(
    token: string,
    now = new Date(),
  ): Promise<{ user: SessionUser; tokenHash: string } | null> {
    const tokenHash = hashToken(token);
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    if (session === null || session.expiresAt <= now) {
      return null;
    }
    return { user: session.user, tokenHash };
  }

  async close(tokenHash: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { tokenHash } });
  }

  /** After a password change: every browser must sign in again. */
  async closeAllFor(userId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId } });
  }
}
