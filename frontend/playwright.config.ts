import { existsSync, readFileSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// The values come from config/application.yml (the `e2e` block, the frontend port and the MailHog port); `npm run config` writes them to
// this git-ignored file. Variables already in the environment, e.g. from CI, win over the file.
const generated = 'e2e/support/e2e-config.generated.json';
if (existsSync(generated)) {
  for (const [name, value] of Object.entries(JSON.parse(readFileSync(generated, 'utf8')) as Record<string, string>)) {
    process.env[name] ??= value;
  }
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
  // A slow sign-in (see SIGN_IN_TIMEOUT in e2e/support/ui.ts) must not eat the whole budget of a test.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env['E2E_BASE_URL'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
