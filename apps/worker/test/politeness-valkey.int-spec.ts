import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Redis } from 'ioredis';

import { type StartedDependency, startValkey } from '../../../test-support/containers.js';
import { createValkeyGate } from '../src/scan/politeness.js';

describe('politeness gate on Valkey', () => {
  let valkey: StartedDependency;
  let clients: Redis[];

  beforeAll(async () => {
    valkey = await startValkey();
    // Two connections stand for two worker processes scanning the same host.
    clients = [new Redis(valkey.url), new Redis(valkey.url)];
  });

  const firstClient = (): Redis => {
    const [client] = clients;
    if (client === undefined) {
      throw new Error('no Valkey client');
    }
    return client;
  };

  afterAll(async () => {
    for (const client of clients) {
      client.disconnect();
    }
    await valkey.container.stop();
  });

  it('spaces the turns of every process by the interval, for the same host', async () => {
    const [first, second] = clients.map((client) => createValkeyGate(client));
    const signal = new AbortController().signal;
    const turns: number[] = [];
    const take = async (gate: ReturnType<typeof createValkeyGate> | undefined): Promise<void> => {
      for (let index = 0; index < 3; index += 1) {
        await gate?.wait('www.example.fr', 300, signal);
        turns.push(Date.now());
      }
    };

    await Promise.all([take(first), take(second)]);

    turns.sort((a, b) => a - b);
    const gaps = turns.slice(1).map((time, index) => time - (turns[index] ?? time));
    expect(turns).toHaveLength(6);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(290);
  });

  it('does not make different hosts wait for each other', async () => {
    const gate = createValkeyGate(firstClient());
    const signal = new AbortController().signal;
    const started = Date.now();

    await Promise.all([gate.wait('a.example', 5000, signal), gate.wait('b.example', 5000, signal)]);

    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('stops waiting when the scan is cancelled', async () => {
    const gate = createValkeyGate(firstClient());
    await gate.wait('busy.example', 10_000, new AbortController().signal);
    const controller = new AbortController();

    const waiting = gate.wait('busy.example', 10_000, controller.signal);
    controller.abort(new Error('scan time limit reached'));

    await expect(waiting).rejects.toThrow('scan time limit reached');
  });
});
