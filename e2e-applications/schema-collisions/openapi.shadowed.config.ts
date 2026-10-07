import { defineConfig } from '../../src/config/config.js';

export default defineConfig({
  output: 'openapi.shadowed.generated.json',

  files: {
    entry: 'src/app.module.ts',
    tsconfig: '../tsconfig.json',
    dtoGlob: 'src/**/*.dto.ts',
  },

  openapi: {
    info: {
      title: 'Schema Collisions API',
      version: '1.0.0',
    },
  },

  options: {
    // Only orders: AddressDto is reached through one declaration, but
    // shipping and product/dto declare other AddressDto classes
    pathFilter: /^\/orders/,
  },
});
