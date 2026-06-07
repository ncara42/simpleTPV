import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // Demo es opt-in (A-02); los tests corren en demo por defecto.
    env: { VITE_DEMO_MODE: 'true' },
  },
});
