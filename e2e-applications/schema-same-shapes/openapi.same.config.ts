import { defineConfig } from '../../src/config/config.js';

export default defineConfig({
  output: 'openapi.same.generated.json',

  files: {
    entry: 'src/app.module.ts',
    tsconfig: '../tsconfig.json',
    dtoGlob: 'src/**/*.dto.ts',
  },

  openapi: {
    info: {
      title: 'Schema Same Shapes API',
      version: '1.0.0',
    },
  },

  options: {
    // Only routes whose same-name declarations are equal
    schemaNameCollision: 'error',
    pathFilter: /^\/same\//,
  },
});
