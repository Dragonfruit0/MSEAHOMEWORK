import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./test/setup.ts'],
    // A small, deliberately simple integration suite against a real Postgres
    // test database — sequential execution avoids cross-file races over
    // shared table state rather than requiring per-file DB isolation.
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
