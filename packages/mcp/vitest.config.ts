import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      // La lógica unit-testable es el core OAuth; el cableado HTTP, el puente al
      // backend (I/O de red) y las definiciones de tools se cubren con los e2e.
      include: ['src/oauth/**'],
      exclude: ['src/oauth/store-redis.ts', 'src/**/*.test.ts'],
    },
  },
});
