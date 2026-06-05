import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // Demo es opt-in (A-01); los tests corren en demo por defecto. Los que prueban
    // el cableado real (wiring.test.ts) lo sobrescriben con vi.stubEnv('...', 'false').
    env: { VITE_DEMO_MODE: 'true' },
  },
});
