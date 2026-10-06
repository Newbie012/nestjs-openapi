import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30000, // 30s timeout for E2E tests with ts-morph
    // E2E files generate their spec once in beforeAll
    hookTimeout: 30000,
  },
});
