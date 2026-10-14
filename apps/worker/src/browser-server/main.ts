/**
 * Runs the browser of the scan engine in its own container, and exposes it to
 * the worker over a WebSocket on a secret path.
 *
 * Every request of the browser goes through the egress proxy, loopback
 * included, and the container's network has no other way out. Chromium keeps
 * its own sandbox: a page that exploited a flaw in the renderer would still be
 * confined to it.
 */
import { ConfigError } from '@rampe/shared';
import { chromium } from 'playwright-core';

import { loadBrowserServerConfig } from './config.js';

async function start(): Promise<void> {
  const config = loadBrowserServerConfig(process.env);
  const server = await chromium.launchServer({
    host: '0.0.0.0',
    port: config.port,
    wsPath: config.wsPath,
    headless: true,
    chromiumSandbox: true,
    // "<-loopback>" removes Chromium's implicit exception: localhost goes through the proxy too.
    proxy: { server: config.egressProxyUrl, bypass: '<-loopback>' },
    args: [
      // WebRTC could otherwise send UDP traffic around the proxy.
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
    ],
  });
  console.info(`Browser ready on port ${String(config.port)}`);

  // If Chromium dies, so does the container, and Docker restarts it.
  server.process().once('exit', (code) => {
    console.error(`Chromium exited (${String(code)})`);
    process.exit(1);
  });
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      void server.close().finally(() => process.exit(0));
    });
  }
}

start().catch((error: unknown) => {
  console.error(error instanceof ConfigError ? error.message : error);
  process.exitCode = 1;
});
