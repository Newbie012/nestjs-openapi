import { defineConfig } from '../../src/config.js';

export default defineConfig({
  output: 'openapi.uri.generated.json',

  files: {
    entry: 'src/app.module.ts',
    tsconfig: '../tsconfig.json',
  },

  openapi: {
    info: {
      title: 'Versioning API',
      version: '1.0.0',
    },
  },

  options: {
    versioning: { type: 'uri', defaultVersion: '3' },
  },
});
