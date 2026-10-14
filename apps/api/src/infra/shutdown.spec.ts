import { describe, expect, it } from '@jest/globals';

import { closeWithin } from './shutdown.js';

describe('closeWithin', () => {
  it('waits for a resource that closes', async () => {
    let closed = false;

    await closeWithin(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      closed = true;
    });

    expect(closed).toBe(true);
  });

  it('gives up on a resource that never closes', async () => {
    const started = Date.now();

    await closeWithin(() => new Promise(() => undefined), 50);

    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('ignores a resource that fails to close', async () => {
    await expect(closeWithin(() => Promise.reject(new Error('gone')))).resolves.toBeUndefined();
  });
});
