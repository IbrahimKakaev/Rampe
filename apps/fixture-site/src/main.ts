import { fileURLToPath } from 'node:url';

import { createFixtureServer } from './server.js';

const port = Number(process.env['PORT'] ?? 8080);
const publicDir = fileURLToPath(new URL('../public', import.meta.url));

const server = createFixtureServer({
  publicDir,
  verificationToken: process.env['DEMO_VERIFICATION_TOKEN'],
});
server.listen(port, '0.0.0.0', () => {
  console.info(`Fixture site listening on port ${String(port)}`);
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
}
