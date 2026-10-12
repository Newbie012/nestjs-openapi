import { defineConfig } from '../../src/config/config.js';

// Each module is found in one entry only, and OrdersModule in none
export default defineConfig({
  output: 'openapi.include.generated.json',
  files: {
    entry: ['src/users/users.module.ts', 'src/products/products.module.ts'],
    tsconfig: '../tsconfig.json',
  },
  openapi: {
    info: { title: 'Multi-Entry API', version: '1.0.0' },
  },
  options: {
    include: ['UsersModule', 'ProductsModule', 'OrdersModule'],
  },
});
