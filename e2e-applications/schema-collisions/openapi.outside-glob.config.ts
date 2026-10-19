import { defineConfig } from '../../src/config/config.js';

export default defineConfig({
  output: 'openapi.outside-glob.generated.json',

  files: {
    entry: 'src/outside-glob/app.module.ts',
    tsconfig: '../tsconfig.json',
    dtoGlob: 'src/outside-glob/**/*.dto.ts',
  },

  openapi: {
    info: {
      title: 'Schema Collisions API',
      version: '1.0.0',
    },
  },

  options: {
    schemas: { additionalProperties: 'forbid' },
    pathFilter: (path) => !path.includes('/internal/'),
  },
});
