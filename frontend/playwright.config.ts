import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Local values live in frontend/.env.e2e (git-ignored; copy .env.e2e.example). Variables already in the
// environment, e.g. from CI, win over the file.
if (existsSync('.env.e2e')) {
  process.loadEnvFile('.env.e2e');
}

/**
 * End-to-end journeys against the REAL running stack: the Angular app plus the auth, order and executor
 * services behind it. Nothing is started or mocked here; bring the stack up first (see e2e/README.md).
 *
 * Isolation: every spec file runs in its own worker process, every test gets a fresh browser context
 * (no shared cookies or localStorage), and no test relies on another having run.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  forbidOnly: !!process.env['CI'],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env['E2E_BASE_URL'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
