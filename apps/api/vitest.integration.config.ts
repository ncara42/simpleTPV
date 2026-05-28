import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.integration.spec.ts'],
    exclude: ['node_modules', 'dist'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
