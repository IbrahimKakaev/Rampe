import * as z from 'zod/mini';

import {
  emailSchema,
  idSchema,
  nameSchema,
  passwordSchema,
  roleSchema,
  tokenSchema,
} from './common.js';

export const registerRequestSchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
  organizationName: nameSchema,
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const verifyEmailRequestSchema = z.strictObject({ token: tokenSchema });

export const loginRequestSchema = z.strictObject({
  email: emailSchema,
  password: z.string().check(z.minLength(1), z.maxLength(128)),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const forgotPasswordRequestSchema = z.strictObject({ email: emailSchema });

export const resetPasswordRequestSchema = z.strictObject({
  token: tokenSchema,
  password: passwordSchema,
});

export const membershipSummarySchema = z.strictObject({
  id: idSchema,
  name: z.string(),
  role: roleSchema,
});

export const meSchema = z.strictObject({
  user: z.strictObject({ id: idSchema, email: z.string(), name: z.string() }),
  organizations: z.array(membershipSummarySchema),
});
export type Me = z.infer<typeof meSchema>;
