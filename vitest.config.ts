import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@bareeq/shared': fileURLToPath(new URL('./src/shared/index.ts', import.meta.url)),
    },
    conditions: ['source'],
  },
  ssr: {
    resolve: {
      conditions: ['source'],
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    setupFiles: ['./tests/setup-env.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    environment: 'node',
  },
});
