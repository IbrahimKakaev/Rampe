import * as z from 'zod/mini';

import {
  emailSchema,
  idSchema,
  isoDateSchema,
  nameSchema,
  roleSchema,
  tokenSchema,
} from './common.js';

export const organizationSchema = z.strictObject({
  id: idSchema,
  name: z.string(),
  role: roleSchema,
  retentionMonths: z.number(),
  createdAt: isoDateSchema,
});
export type Organization = z.infer<typeof organizationSchema>;

export const createOrganizationRequestSchema = z.strictObject({ name: nameSchema });

export const updateOrganizationRequestSchema = z.strictObject({
  name: z.optional(nameSchema),
  retentionMonths: z.optional(z.number().check(z.multipleOf(1), z.gte(1), z.lte(120))),
});

/** Deleting an organisation deletes all its data: the owner confirms with their password. */
export const deleteOrganizationRequestSchema = z.strictObject({
  password: z.string().check(z.minLength(1), z.maxLength(128)),
});

export const memberSchema = z.strictObject({
  userId: idSchema,
  email: z.string(),
  name: z.string(),
  role: roleSchema,
  joinedAt: isoDateSchema,
});
export type Member = z.infer<typeof memberSchema>;

export const updateMemberRequestSchema = z.strictObject({ role: roleSchema });

export const createInvitationRequestSchema = z.strictObject({
  email: emailSchema,
  role: roleSchema,
});

export const invitationSchema = z.strictObject({
  id: idSchema,
  email: z.string(),
  role: roleSchema,
  expiresAt: isoDateSchema,
  createdAt: isoDateSchema,
});
export type Invitation = z.infer<typeof invitationSchema>;

export const acceptInvitationRequestSchema = z.strictObject({ token: tokenSchema });
