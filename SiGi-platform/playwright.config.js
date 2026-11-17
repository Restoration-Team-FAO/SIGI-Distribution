// @ts-check
const { defineConfig, devices } = require('@playwright/test');

const frontendBaseUrl = process.env.SIGI_E2E_URL ?? process.env.SIGI_E2E_ADMIN_URL ?? 'http://127.0.0.1:5174';

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 960 },
  },
  projects: [
    {
      name: 'admin-chromium',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: frontendBaseUrl,
      },
      grep: /@admin/,
    },
  ],
});
