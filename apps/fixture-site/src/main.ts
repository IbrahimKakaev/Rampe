import { fileURLToPath } from 'node:url';

import { createFixtureServer } from './server.js';
import { createControlServer, PublishedTokens } from './verification.js';

const port = Number(process.env['PORT'] ?? 8080);
const controlPort = Number(process.env['CONTROL_PORT'] ?? 8081);
const publicDir = fileURLToPath(new URL('../public', import.meta.url));

const verificationTokens = new PublishedTokens(process.env['DEMO_VERIFICATION_TOKEN']);
const server = createFixtureServer({ publicDir, verificationTokens });
server.listen(port, '0.0.0.0', () => {
  console.info(`Fixture site listening on port ${String(port)}`);
});
// Loopback only: reachable through `docker compose exec`, never from the network.
const control = createControlServer(verificationTokens);
control.listen(controlPort, '127.0.0.1');

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    control.close();
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
}
