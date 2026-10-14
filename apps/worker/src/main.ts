import {
  ConfigError,
  SCAN_DEFAULTS,
  SCAN_EVENTS_QUEUE,
  type ScanEvent,
  SCANS_QUEUE,
  SITE_CHECKS_QUEUE,
} from '@rampe/shared';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';

import { loadScanConfig } from './scan/config.js';
import { createProxiedFetcher } from './scan/http-fetcher.js';
import { createScanJobHandler, createSiteCheckHandler } from './scan/jobs.js';
import { createValkeyGate } from './scan/politeness.js';
import { runScan } from './scan/scan.js';
import { buildUserAgent } from './scan/user-agent.js';
import { createSystemWorker } from './system-worker.js';

function start(): void {
  const config = loadScanConfig(process.env);
  const connection = { url: config.valkeyUrl };
  const userAgent = buildUserAgent(config.botInfoUrl);
  const valkey = new Redis(config.valkeyUrl, { maxRetriesPerRequest: 3 });
  valkey.on('error', (error) => {
    console.error(`Valkey: ${error.message}`);
  });
  const fetcher = createProxiedFetcher({
    proxyUrl: config.egressProxyUrl,
    userAgent,
    timeoutMs: 15_000,
  });
  const gate = createValkeyGate(valkey);
  const events = new Queue<ScanEvent>(SCAN_EVENTS_QUEUE, { connection });

  const handleScan = createScanJobHandler({
    runScan: (request) =>
      runScan(request, {
        browserWsEndpoint: config.browserWsEndpoint,
        fetchText: fetcher.fetchText,
        gate,
        userAgent,
        log: (message) => {
          console.info(message);
        },
      }),
    emit: async (event, id) => {
      // The API retries a closing message until every page is recorded.
      await events.add(event.type, event, {
        jobId: id,
        attempts: 10,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      });
    },
  });
  const handleSiteCheck = createSiteCheckHandler({
    fetchText: fetcher.fetchText,
    gate,
    intervalMs: SCAN_DEFAULTS.navigationIntervalMs,
  });

  const workers = [
    createSystemWorker(connection),
    // One scan at a time per worker: the browser is the scarce resource.
    new Worker(SCANS_QUEUE, (job) => handleScan(job.data), {
      connection,
      concurrency: 1,
      lockDuration: 60_000,
    }),
    new Worker(SITE_CHECKS_QUEUE, (job) => handleSiteCheck(job.data), {
      connection,
      concurrency: 4,
    }),
  ];
  for (const worker of workers) {
    worker.on('ready', () => {
      console.info(`Worker ready on queue ${worker.name}`);
    });
    // BullMQ reconnects by itself; without a listener an error would crash the process.
    worker.on('error', (error) => {
      console.error(`Worker ${worker.name}: ${error.message}`);
    });
    worker.on('failed', (job, error) => {
      console.error(`Job ${job?.name ?? 'unknown'} on ${worker.name} failed: ${error.message}`);
    });
  }

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      console.info(`${signal} received, finishing the current jobs`);
      void Promise.all(workers.map((worker) => worker.close()))
        .then(() => Promise.all([events.close(), fetcher.close()]))
        .finally(() => {
          valkey.disconnect();
          process.exit(0);
        });
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
