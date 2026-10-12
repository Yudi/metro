import { defineConfig, devices } from '@playwright/test';

/** Built application assets are fulfilled by the test; no app/server is started. */
export default defineConfig({
  testDir: './src',
  testMatch: '**/admin.spec.ts',
  timeout: 30_000,
  outputDir: '../../tmp/admin-browser-tests',
  use: { baseURL: 'http://localhost:4200', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
