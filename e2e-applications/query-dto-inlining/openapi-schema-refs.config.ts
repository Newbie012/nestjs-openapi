import { defineConfig } from '../../src/config.js';

/**
 * Schema refs config - query DTOs are kept as schema references (legacy behavior)
 */
export default defineConfig({
  output: 'openapi-schema-refs.generated.json',
  files: {
    entry: 'src/app.module.ts',
    tsconfig: 'tsconfig.json',
    dtoGlob: 'src/**/*.dto.ts',
  },
  openapi: {
    info: {
      title: 'Query DTO Schema Refs Test API',
      version: '1.0.0',
      description:
        'Tests query DTO schema ref behavior - DTOs should be kept as single parameters with $ref',
    },
  },
  options: {
    query: { style: 'ref' }, // Keep DTOs as schema refs instead of inlining
  },
});
