import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

import type { Role } from '../generated/prisma/client.js';

export interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

export interface OrganizationAccess {
  readonly organizationId: string;
  readonly role: Role;
}

/** What the guards attach to a request. */
export interface RampeRequest extends Request {
  user?: SessionUser;
  sessionTokenHash?: string;
  access?: OrganizationAccess;
}

export const PUBLIC_ROUTE = 'rampe:public';
/** The route needs no session: sign-in, sign-up, health. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_ROUTE, true);

export const OWNER_ONLY = 'rampe:owner-only';
/** Only an owner of the organisation in the path may call the route. */
export const OwnerOnly = (): MethodDecorator => SetMetadata(OWNER_ONLY, true);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionUser => {
    const user = context.switchToHttp().getRequest<RampeRequest>().user;
    if (user === undefined) {
      throw new Error('CurrentUser used on a route without a session');
    }
    return user;
  },
);

/** The organisation of the `:org` path parameter, checked by the access guard. */
export const CurrentOrganization = createParamDecorator(
  (_data: unknown, context: ExecutionContext): OrganizationAccess => {
    const access = context.switchToHttp().getRequest<RampeRequest>().access;
    if (access === undefined) {
      throw new Error('CurrentOrganization used on a route without :org');
    }
    return access;
  },
);
