import { ConfigError } from '@rampe/shared';

import { loadConfig } from './config.js';
import { createSystemWorker } from './system-worker.js';

function start(): void {
  const config = loadConfig(process.env);
  const worker = createSystemWorker({ url: config.valkeyUrl });

  worker.on('ready', () => {
    console.info('Worker ready, waiting for jobs');
  });
  // BullMQ reconnects by itself; without a listener an error would crash the process.
  worker.on('error', (error) => {
    console.error(`Worker error: ${error.message}`);
  });
  worker.on('failed', (job, error) => {
    console.error(`Job ${job?.name ?? 'unknown'} failed: ${error.message}`);
  });

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      console.info(`${signal} received, finishing the current jobs`);
      void worker.close().finally(() => process.exit(0));
    });
  }
}

try {
  start();
} catch (error) {
  // A configuration error is the operator's to fix: print it plainly, without a stack trace.
  console.error(error instanceof ConfigError ? error.message : error);
  process.exitCode = 1;
}
