import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import argon2 from 'argon2';

/** A random token for a cookie or an e-mail link: 32 bytes, base64url. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** What the database stores of a token: if the database leaks, the tokens do not. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Compares two strings in constant time. */
export function sameSecret(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** argon2id with the library's defaults (64 MiB, 3 passes), above OWASP's minimum. */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * A hash to verify against when the account does not exist, so that a login
 * attempt takes as long whether the address is known or not.
 */
export const DUMMY_PASSWORD_HASH = hashPassword(newToken());
