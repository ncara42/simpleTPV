import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  // E2E contra backend real: el bundle se construye sin modo demo y el proxy
  // /api → :3001 (packages/web-config/vite.base.ts) lo conecta a la API real.
  // En CI el job de e2e provisiona Postgres + migrate + bootstrap + seed:demo + API.
  webServer: {
    command: 'pnpm exec vite build && pnpm exec vite preview --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    // PWA desactivada en e2e: el service worker (precache/registro) no debe
    // interferir con los tests deterministas; el offline se prueba aparte.
    env: { VITE_PWA_DISABLED: 'true' },
  },
});
