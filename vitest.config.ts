import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/cli.ts'],
      thresholds: {
        lines: 70,
      },
    },
  },
  resolve: {
    extensions: ['.ts', '.js', '.mts', '.mjs'],
    conditions: ['import', 'module', 'browser', 'default'],
  },
});
