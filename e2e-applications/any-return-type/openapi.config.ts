import { defineConfig } from '../../src/index.js';

export default defineConfig({
  output: 'openapi.generated.json',
  files: {
    entry: 'src/app.module.ts',
    tsconfig: 'tsconfig.json',
    dtoGlob: 'src/**/*.ts',
  },
  openapi: {
    info: {
      title: 'Any Return Type Test API',
      version: '1.0',
      description: 'Testing any return type handling',
    },
  },
});
