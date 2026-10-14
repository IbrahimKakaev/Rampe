import type { Redis } from 'ioredis';

/**
 * Spaces out the navigations to a host. Every scan, in every worker process,
 * shares the same gate, so the limit holds per host and not per scan.
 */
export interface NavigationGate {
  /** Resolves once the caller may send its next request to `host`. */
  wait(host: string, intervalMs: number, signal: AbortSignal): Promise<void>;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason as Error);
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal.reason as Error);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * A gate held in Valkey. A key per host lives for one interval; taking a turn
 * means creating it (SET … NX PX), which only one caller at a time can do. The
 * others wait for it to expire and try again.
 */
export function createValkeyGate(client: Pick<Redis, 'set' | 'pttl'>): NavigationGate {
  return {
    async wait(host, intervalMs, signal) {
      const key = `rampe:politeness:${host}`;
      for (;;) {
        if (signal.aborted) {
          throw signal.reason as Error;
        }
        if ((await client.set(key, '1', 'PX', intervalMs, 'NX')) === 'OK') {
          return;
        }
        const remaining = await client.pttl(key);
        await sleep(remaining > 0 ? remaining : 10, signal);
      }
    },
  };
}
