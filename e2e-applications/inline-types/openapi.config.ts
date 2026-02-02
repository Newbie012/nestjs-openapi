import { defineConfig } from '../../src/config.js';

export default defineConfig({
  output: 'openapi.generated.json',
  files: {
    entry: 'src/app.module.ts',
    tsconfig: '../tsconfig.json',
  },
  openapi: {
    info: {
      title: 'Inline Types API',
      version: '1.0.0',
      description: 'API demonstrating inline return type extraction',
    },
  },
});
