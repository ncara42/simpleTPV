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
  // Demo es opt-in (A-02): se construye el bundle con VITE_DEMO_MODE=true para que
  // los e2e corran en demo sin backend (antes era el default del build).
  webServer: {
    command: 'pnpm exec vite build && pnpm exec vite preview --port 4174',
    url: 'http://localhost:4174',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: { VITE_DEMO_MODE: 'true' },
  },
});
