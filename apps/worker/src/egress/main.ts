import { lookup } from 'node:dns/promises';

import { ConfigError } from '@rampe/shared';

import { isPublicAddress } from './address-policy.js';
import { loadEgressConfig } from './config.js';
import { createEgressProxy } from './egress-proxy.js';

/** Long enough for a slow page, short enough not to keep dead connections. */
const IDLE_TIMEOUT_MS = 60_000;

function start(): void {
  const config = loadEgressConfig(process.env);
  const server = createEgressProxy({
    allowedPorts: new Set([80, 443]),
    allowedPrivateHosts: config.allowedPrivateHosts,
    isPublic: isPublicAddress,
    resolve: async (hostname) =>
      (await lookup(hostname, { all: true, verbatim: true })).map(({ address }) => address),
    idleTimeoutMs: IDLE_TIMEOUT_MS,
    // One JSON line per decision. Paths and query strings are left out: they
    // can carry personal data of the scanned site's visitors.
    log: (entry) => {
      console.log(JSON.stringify({ time: new Date().toISOString(), ...entry }));
    },
  });

  server.listen(config.port, '0.0.0.0', () => {
    console.info(`Egress proxy listening on port ${String(config.port)}`);
    if (config.allowedPrivateHosts.size > 0) {
      console.warn(
        `Private addresses allowed for: ${[...config.allowedPrivateHosts].join(', ')} (development only)`,
      );
    }
  });

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      server.close(() => process.exit(0));
      server.closeAllConnections();
    });
  }
}

try {
  start();
} catch (error) {
  console.error(error instanceof ConfigError ? error.message : error);
  process.exitCode = 1;
}
