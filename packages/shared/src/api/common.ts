import * as z from 'zod/mini';

/** Identifiers are UUIDs. */
export const idSchema = z.uuid();

/** Addresses are compared lower-case; the longest valid address has 254 characters. */
export const emailSchema = z.pipe(
  z.string().check(z.trim(), z.toLowerCase(), z.maxLength(254)),
  z.email({ error: 'Adresse e-mail invalide.' }),
);

/** Long enough to resist guessing, short enough not to be a denial of service for argon2. */
export const passwordSchema = z
  .string()
  .check(
    z.minLength(12, { error: 'Le mot de passe doit faire au moins 12 caractères.' }),
    z.maxLength(128, { error: 'Le mot de passe doit faire au plus 128 caractères.' }),
  );

export const nameSchema = z.string().check(z.trim(), z.minLength(1), z.maxLength(100));

/** Random tokens sent by e-mail or set in cookies: base64url, 43 characters for 32 bytes. */
export const tokenSchema = z.string().check(z.regex(/^[A-Za-z0-9_-]{32,128}$/));

export const roleSchema = z.enum(['OWNER', 'MEMBER']);
export type Role = z.infer<typeof roleSchema>;

export const isoDateSchema = z.iso.datetime();

/** Body of the answers that only acknowledge a request, such as "an e-mail was sent if…". */
export const acceptedSchema = z.strictObject({ status: z.literal('accepted') });
export type Accepted = z.infer<typeof acceptedSchema>;

/** Every error the API returns has this shape. */
export const apiErrorSchema = z.object({
  statusCode: z.number(),
  message: z.union([z.string(), z.array(z.string())]),
  error: z.optional(z.string()),
});
