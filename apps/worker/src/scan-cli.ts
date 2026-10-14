/**
 * Scans a site and prints the report as JSON on standard output. Progress and
 * errors go to standard error.
 *
 *   node dist/scan-cli.js <url> [--max-pages N] [--max-depth N]
 *                               [--page-timeout-ms N] [--scan-timeout-ms N]
 *
 * Until the API exists (milestone J3), this is how a scan is started. It runs
 * inside the worker container, which reaches the browser and the egress proxy.
 */
import { parseArgs } from 'node:util';

import { ConfigError, scanReportSchema } from '@rampe/shared';
import { Redis } from 'ioredis';

import { loadScanConfig } from './scan/config.js';
import { createProxiedFetcher } from './scan/http-fetcher.js';
import { InvalidLimitError, limitsFromOptions } from './scan/limits.js';
import { createValkeyGate } from './scan/politeness.js';
import { InvalidTargetError, runScan } from './scan/scan.js';
import { buildUserAgent } from './scan/user-agent.js';

const USAGE =
  'Usage: scan-cli <url> [--max-pages N] [--max-depth N] [--page-timeout-ms N] [--scan-timeout-ms N]';

async function main(): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        'max-pages': { type: 'string' },
        'max-depth': { type: 'string' },
        'page-timeout-ms': { type: 'string' },
        'scan-timeout-ms': { type: 'string' },
      },
    });
  } catch (error) {
    console.error(`${(error as Error).message}\n${USAGE}`);
    return 2;
  }
  const [url, ...extra] = parsed.positionals;
  if (url === undefined || extra.length > 0) {
    console.error(USAGE);
    return 2;
  }

  let limits;
  let config;
  try {
    limits = limitsFromOptions({
      maxPages: parsed.values['max-pages'],
      maxDepth: parsed.values['max-depth'],
      pageTimeoutMs: parsed.values['page-timeout-ms'],
      scanTimeoutMs: parsed.values['scan-timeout-ms'],
    });
    config = loadScanConfig(process.env);
  } catch (error) {
    if (error instanceof InvalidLimitError || error instanceof ConfigError) {
      console.error(error.message);
      return 2;
    }
    throw error;
  }

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
  try {
    console.error(`Scanning ${url}…`);
    const report = await runScan(
      { url, limits },
      {
        browserWsEndpoint: config.browserWsEndpoint,
        fetchText: fetcher.fetchText,
        gate: createValkeyGate(valkey),
        userAgent,
      },
    );
    // The report is the contract with the API: it is checked before it leaves.
    process.stdout.write(`${JSON.stringify(scanReportSchema.parse(report), null, 2)}\n`);
    console.error(`Scan ${report.status}: ${String(report.pages.length)} page(s).`);
    return 0;
  } catch (error) {
    if (error instanceof InvalidTargetError) {
      console.error(error.message);
      return 2;
    }
    throw error;
  } finally {
    await fetcher.close();
    valkey.disconnect();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  },
);
