import { defineConfig } from '../../src/config.js';

export default defineConfig({
  output: 'openapi.generated.json',
  files: {
    entry: ['src/users/users.module.ts', 'src/products/products.module.ts'],
    tsconfig: '../tsconfig.json',
  },
  openapi: {
    info: {
      title: 'Multi-Entry API',
      version: '1.0.0',
      description: 'API with multiple entry modules',
    },
  },
});
