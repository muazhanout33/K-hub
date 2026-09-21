import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'e2e-cross-browser.spec.ts',
  timeout: 120_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    viewport: { width: 1280, height: 720 },
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox',  use: { browserName: 'firefox' } },
    { name: 'webkit',   use: { browserName: 'webkit' } },
  ],
});
