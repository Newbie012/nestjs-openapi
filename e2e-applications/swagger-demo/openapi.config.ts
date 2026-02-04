// Note: In a real app, you would import from 'nestjs-openapi'
// import { defineConfig } from 'nestjs-openapi';
import { defineConfig } from '../../src/config';

export default defineConfig({
  output: 'openapi.generated.json',

  files: {
    entry: 'src/app.module.ts',
    tsconfig: 'tsconfig.json',
    dtoGlob: 'src/**/*.dto.ts',
  },

  openapi: {
    info: {
      title: 'Users API',
      version: '1.0.0',
      description: 'Demo API showcasing Swagger UI integration',
    },
    tags: [
      {
        name: 'users',
        description: 'User management endpoints',
      },
    ],
  },
});
