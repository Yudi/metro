import { defineConfig, devices } from '@playwright/test';

/** Tests the built UI without starting a development or application server. */
export default defineConfig({
  testDir: './src',
  testMatch: '**/notifications-storybook.spec.ts',
  timeout: 30_000,
  outputDir: '../../tmp/notification-story-tests',
  use: { baseURL: 'http://localhost:4400' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
