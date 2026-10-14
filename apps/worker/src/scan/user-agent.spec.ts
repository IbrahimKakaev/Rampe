import { describe, expect, it } from '@jest/globals';

import { buildUserAgent } from './user-agent.js';

describe('buildUserAgent', () => {
  it('names RampeBot 1.0 and links to its information page', () => {
    expect(buildUserAgent('https://rampe.example/robot')).toBe(
      'Mozilla/5.0 (compatible; RampeBot/1.0; +https://rampe.example/robot)',
    );
  });
});
