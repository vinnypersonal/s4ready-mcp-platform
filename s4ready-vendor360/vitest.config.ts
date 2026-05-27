import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@s4ready/core': path.resolve(__dirname, '../s4ready-core/src/index.ts')
    }
  }
});
