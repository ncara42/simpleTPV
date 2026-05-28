import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    exclude: ['test/**', 'node_modules', 'dist'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['json-summary', 'text'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts'],
    },
  },
});
