// Note: In a real app, you would import from 'nestjs-openapi'
// import { defineConfig } from 'nestjs-openapi';
import { defineConfig } from '../../src/config';

export default defineConfig({
  output: 'openapi.generated.json',

  files: {
    entry: 'src/app.module.ts',
    tsconfig: 'tsconfig.json',
    // Generate JSON schemas from TypeScript interfaces
    dtoGlob: 'src/**/*.dto.ts',
  },

  openapi: {
    info: {
      title: 'Products API',
      version: '1.0.0',
      description:
        'Demo API showcasing OpenApiModule with interface-based DTOs',
    },
    tags: [
      {
        name: 'products',
        description: 'Product management endpoints',
      },
    ],
  },
});
