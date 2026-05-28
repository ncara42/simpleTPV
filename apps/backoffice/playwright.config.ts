import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4174',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm exec vite preview --port 4174',
    url: 'http://localhost:4174',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
