import { defineConfig } from '../../src/config.js';

export default defineConfig({
  output: 'openapi.generated.json',
  openapi: {
    info: {
      title: 'Monolith Todo API',
      version: '1.0.0',
      description: 'Monolith todo app used for E2E coverage',
    },
  },
});
