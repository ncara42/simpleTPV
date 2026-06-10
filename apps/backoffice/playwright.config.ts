import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:4174',
    trace: 'on-first-retry',
  },
  // 'setup' hace login una vez y guarda storageState; el proyecto principal lo
  // reutiliza para no repetir login (rate limit de /auth/login 5/min/IP).
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { storageState: 'e2e/.auth/admin.json' },
      dependencies: ['setup'],
    },
  ],
  // E2E contra backend real: el bundle se construye sin modo demo y el proxy
  // /api → :3001 (packages/web-config/vite.base.ts) lo conecta a la API real.
  // En CI el job de e2e provisiona Postgres + migrate + bootstrap + seed:demo +
  // API; en local arranca esa pila a mano antes de `pnpm test:e2e`.
  webServer: {
    command: 'pnpm exec vite build && pnpm exec vite preview --port 4174',
    url: 'http://localhost:4174',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
