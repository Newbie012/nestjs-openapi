import { defineConfig } from '../../src/config.js';

export default defineConfig({
  extends: './base.config.ts',
  // Output inherited from base.config.ts, but required by type
  output: 'openapi.generated.json',
  openapi: {
    info: {
      title: 'Extended API',
      version: '2.0.0',
      // description is inherited from base.config.ts
    },
    // servers inherited from base.config.ts
  },
  // options.basePath inherited from base.config.ts
});
