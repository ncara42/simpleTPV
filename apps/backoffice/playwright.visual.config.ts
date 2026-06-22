import { defineConfig } from '@playwright/test';

// Config de REGRESIÓN VISUAL (#211), separada del e2e funcional: NO necesita backend real (el spec
// stubea /api con datos mock), NO hace login y captura el harness aislado (visual.html). Los
// baselines son por plataforma (`-linux` en CI/Docker); se generan en la imagen oficial de
// Playwright para que el job CI (mismo contenedor) case pixel a pixel. Ver job `visual` en ci.yml.
export default defineConfig({
  testDir: './e2e',
  testMatch: /visual\.spec\.ts/,
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  // Determinismo de screenshots: sin animaciones, tolerancia mínima a antialiasing.
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' } },
  use: {
    baseURL: 'http://localhost:4174',
    reducedMotion: 'reduce',
  },
  projects: [{ name: 'visual', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'pnpm exec vite build && pnpm exec vite preview --port 4174',
    url: 'http://localhost:4174/visual.html',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
