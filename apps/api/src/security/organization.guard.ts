import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { Prisma } from '../infra/prisma.js';
import { OWNER_ONLY, type RampeRequest } from './request-context.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * For every route with an `:org` parameter: the signed-in user must be a member
 * of that organisation. A non-member gets 404, as for an organisation that does
 * not exist: the answer must not reveal what exists.
 */
@Injectable()
export class OrganizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: Prisma,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RampeRequest>();
    const organizationId = request.params['org'];
    if (organizationId === undefined) {
      return true;
    }
    const user = request.user;
    if (user === undefined || typeof organizationId !== 'string' || !UUID.test(organizationId)) {
      throw new NotFoundException('Organisation introuvable');
    }
    const membership = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId } },
    });
    if (membership === null) {
      throw new NotFoundException('Organisation introuvable');
    }
    request.access = { organizationId, role: membership.role };
    const ownerOnly = this.reflector.get<boolean | undefined>(OWNER_ONLY, context.getHandler());
    if (ownerOnly === true && membership.role !== 'OWNER') {
      throw new ForbiddenException('Action réservée aux propriétaires de l’organisation');
    }
    return true;
  }
}
