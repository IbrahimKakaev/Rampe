/**
 * Container health check: exits 0 when the worker's Valkey connection settings
 * work from inside the container, 1 otherwise.
 */
import { Redis } from 'ioredis';

import { loadConfig } from './config.js';

const TIMEOUT_MS = 3000;

async function check(): Promise<void> {
  const { valkeyUrl } = loadConfig(process.env);
  const client = new Redis(valkeyUrl, {
    lazyConnect: true,
    connectTimeout: TIMEOUT_MS,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  client.on('error', () => undefined);
  try {
    await client.connect();
    await client.ping();
  } finally {
    client.disconnect();
  }
}

const timer = setTimeout(() => process.exit(1), TIMEOUT_MS);
check().then(
  () => {
    clearTimeout(timer);
  },
  () => {
    process.exit(1);
  },
);
