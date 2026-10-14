import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the application started by `docker compose up`.
 * They do not start it themselves: what is tested is what a fresh clone runs.
 */
export default defineConfig({
  testDir: './tests',
  // A retry would hide a flaky test instead of fixing it.
  retries: 0,
  forbidOnly: process.env['CI'] !== undefined,
  reporter: process.env['CI'] === undefined ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env['BASE_URL'] ?? 'http://127.0.0.1:8080',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
