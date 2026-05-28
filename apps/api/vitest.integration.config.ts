import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    include: ['test/**/*.integration.spec.ts'],
    exclude: ['node_modules', 'dist'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    forks: { singleFork: true },
    // Ficheros en SERIE (no concurrentes en el mismo fork): los tests de
    // integración comparten la misma BD (org1/store1/store2) y, con caja
    // obligatoria, abren/cierran CashSession. Si dos ficheros se solaparan, sus
    // sesiones OPEN chocarían con el índice único parcial "una OPEN por tienda".
    fileParallelism: false,
  },
});
