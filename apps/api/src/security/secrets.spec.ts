import { describe, expect, it } from '@jest/globals';

import { hashPassword, hashToken, newToken, sameSecret, verifyPassword } from './secrets.js';

describe('secrets', () => {
  it('makes random tokens of 43 base64url characters', () => {
    const tokens = new Set(Array.from({ length: 50 }, newToken));

    expect(tokens.size).toBe(50);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });

  it('stores a token as a SHA-256 hash, never as it is', () => {
    const token = newToken();

    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toContain(token);
  });

  it('compares secrets', () => {
    expect(sameSecret('abc', 'abc')).toBe(true);
    expect(sameSecret('abc', 'abd')).toBe(false);
    expect(sameSecret('abc', 'abcd')).toBe(false);
  });

  it('hashes passwords with argon2id and verifies them', async () => {
    const hash = await hashPassword('correct horse battery staple');

    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(verifyPassword(hash, 'correct horse battery staple')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'wrong password!!')).resolves.toBe(false);
    await expect(verifyPassword('not a hash', 'x')).resolves.toBe(false);
  });
});
