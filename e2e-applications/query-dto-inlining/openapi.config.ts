import { defineConfig } from '../../src/config.js';

/**
 * Default config - query DTOs are inlined as individual parameters
 */
export default defineConfig({
  output: 'openapi.generated.json',
  files: {
    entry: 'src/app.module.ts',
    tsconfig: 'tsconfig.json',
    dtoGlob: 'src/**/*.dto.ts',
  },
  openapi: {
    info: {
      title: 'Query DTO Inlining Test API',
      version: '1.0.0',
      description:
        'Tests query DTO inlining behavior - DTOs should be expanded to individual parameters',
    },
  },
  // Default: query.style is "inline" (DTO properties expanded to individual params)
});
