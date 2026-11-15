import { defineConfig } from '../../src/config/config.js';

export default defineConfig({
  output: 'openapi.error.generated.json',

  files: {
    entry: 'src/app.module.ts',
    tsconfig: '../tsconfig.json',
    dtoGlob: 'src/**/*.dto.ts',
  },

  openapi: {
    info: {
      title: 'Schema Name API',
      version: '1.0.0',
    },
  },

  options: {
    // Public DTOs drop their suffix, so UserDto becomes User, like admin's User
    schemaName: ({ name, relativePath }) =>
      relativePath.startsWith('src/public/') ? name.replace(/Dto$/, '') : name,
    schemaNameCollision: 'error',
  },
});
