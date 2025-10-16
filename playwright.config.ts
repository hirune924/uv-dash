import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.ts$/, // Match normal .spec.ts files
  testIgnore: /.*\.ci\.spec\.ts$/, // Exclude CI-only tests from normal test runs
  timeout: 120000, // 120 seconds - increased for larger test suites with multiple apps
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0, // Retry once in CI to handle flaky tests
  workers: 1, // Electron tests should run sequentially
  reporter: process.env.CI ? [['html'], ['github']] : 'html',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
