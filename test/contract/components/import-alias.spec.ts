import { surface } from '../harness.js';

const contract = surface(import.meta.url);

contract('import-alias', {
  spec: 'https://spec.openapis.org/oas/v3.0.3#components-object',
  fixture: 'import-alias',
  config: {
    files: {
      entry: 'src/app.module.ts',
      tsconfig: './tsconfig.json',
      dtoGlob: 'src/**/*.dto.ts',
    },
    openapi: {
      info: {
        title: 'Import Alias Test API',
        version: '1.0.0',
        description:
          'Tests for import alias resolution and built-in type handling',
      },
    },
  },
});
