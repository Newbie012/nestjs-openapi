import { defineConfig } from '../../src/index.js';

export default defineConfig({
  output: 'output.static.json',
  files: {
    entry: 'src/app.module.ts',
    tsconfig: 'tsconfig.json',
    dtoGlob: 'src/**/*.ts',
  },
  openapi: {
    info: {
      title: 'Comparison Benchmark API',
      version: '1.0',
      description: 'API for testing nestjs-openapi output',
    },
  },
});
