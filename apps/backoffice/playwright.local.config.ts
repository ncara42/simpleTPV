import { defineConfig } from '@playwright/test';

// Config LOCAL para verificar B-04 (import/export) contra el backend real, sin
// depender de una pila levantada a mano: Playwright arranca él mismo la API Rust y
// el frontend (preview), espera a que estén sanos, corre el spec y los apaga.
// Requiere Postgres en :5434 con la BD `simpletpv_e2e` migrada + seed:demo.

const API = '../../crates/target/debug/simpletpv-api';
const apiEnv =
  "DATABASE_URL_APP='postgresql://app:app_dev_password@localhost:5434/simpletpv_e2e' " +
  "DATABASE_URL_AUTH='postgresql://app_admin:app_admin_dev_password@localhost:5434/simpletpv_e2e' " +
  "DATABASE_URL_ADMIN='postgresql://postgres:postgres@localhost:5434/simpletpv_e2e' " +
  "DATABASE_URL='postgresql://postgres:postgres@localhost:5434/simpletpv_e2e?schema=public' " +
  "REDIS_URL='redis://:redis_dev_password@localhost:6381' " +
  "JWT_SECRET='local-e2e-access-secret-0123456789abcd' " +
  "JWT_REFRESH_SECRET='local-e2e-refresh-secret-0123456789abcd' " +
  "COOKIE_SECURE='false' BIND_ADDR='0.0.0.0:3001' THROTTLE_LIMIT='600' " +
  "CORS_ORIGINS='http://localhost:4174,http://localhost:5173'";

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 90000,
  use: {
    baseURL: 'http://localhost:4174',
    trace: 'retain-on-failure',
    reducedMotion: 'reduce',
  },
  // Login una vez (setup) → el spec reutiliza el storageState, como el e2e normal.
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      testMatch: /import-export\.spec\.ts/,
      use: { storageState: 'e2e/.auth/admin.json' },
      dependencies: ['setup'],
    },
  ],
  webServer: [
    {
      command: `env ${apiEnv} ${API}`,
      url: 'http://localhost:3001/health',
      reuseExistingServer: true,
      timeout: 60000,
    },
    {
      command: 'pnpm exec vite build && pnpm exec vite preview --port 4174',
      url: 'http://localhost:4174',
      reuseExistingServer: true,
      timeout: 120000,
    },
  ],
});
