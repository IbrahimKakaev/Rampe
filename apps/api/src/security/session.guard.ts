import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PUBLIC_ROUTE, type RampeRequest } from './request-context.js';
import { SESSION_COOKIE, Sessions } from './sessions.js';

/** Every route needs a valid session, unless marked @Public(). */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: Sessions,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RampeRequest>();
    const token = (request.cookies as Record<string, unknown> | undefined)?.[SESSION_COOKIE];
    const session = typeof token === 'string' ? await this.sessions.resolve(token) : null;
    if (session !== null) {
      request.user = session.user;
      request.sessionTokenHash = session.tokenHash;
    }
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true || session !== null) {
      return true;
    }
    throw new UnauthorizedException('Non authentifié');
  }
}
