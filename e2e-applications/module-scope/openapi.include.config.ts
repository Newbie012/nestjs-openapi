import { defineConfig } from '../../src/config.js';

export default defineConfig({
  output: 'openapi.include.generated.json',

  files: {
    entry: 'src/app.module.ts',
    tsconfig: '../tsconfig.json',
  },

  openapi: {
    info: {
      title: 'Module Scope API',
      version: '1.0.0',
    },
  },

  options: {
    include: ['ExternalApiModule'],
  },
});
