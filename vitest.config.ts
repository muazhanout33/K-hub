import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.tsx'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', '.next', '.opencode', 'tests/e2e', 'tests/playwright'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', '.next/', 'tests/'],
    },
    environmentOptions: {
      jsdom: {
        url: 'http://localhost:3000',
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
