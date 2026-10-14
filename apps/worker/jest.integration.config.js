import { nodeJestConfig } from '../../jest.preset.js';

// Integration tests start real containers through Testcontainers: Docker must be running.
// Jest may print "did not exit one second after the test run": the Docker client keeps
// its connections to the daemon open for a moment. The process exits by itself right after.
export default nodeJestConfig({
  testMatch: ['<rootDir>/test/**/*.int-spec.ts'],
  testTimeout: 120_000,
});
