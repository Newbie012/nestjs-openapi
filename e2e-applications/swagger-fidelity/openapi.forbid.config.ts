import { defineConfig } from '../../src/config/config.js';

export default defineConfig({
  extends: './openapi.config.ts',
  output: 'openapi.forbid.generated.json',
  openapi: {
    info: { title: 'Swagger Fidelity API', version: '1.0.0' },
  },
  options: {
    schemas: { additionalProperties: 'forbid' },
  },
});
