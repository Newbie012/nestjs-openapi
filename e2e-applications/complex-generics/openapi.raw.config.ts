import { defineConfig } from '../../src/config/config.js';

// Generic instantiations keep their TypeScript names, e.g. `Page<User>`
export default defineConfig({
  extends: './openapi.config.ts',
  output: 'openapi.raw.generated.json',
  openapi: {
    info: {
      title: 'Complex Generics API',
      version: '1.0.0',
    },
  },
  options: {
    schemas: {
      genericNames: 'raw',
    },
  },
});
