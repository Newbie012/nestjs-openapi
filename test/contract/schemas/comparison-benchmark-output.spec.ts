import { surface } from '../harness.js';

const contract = surface(import.meta.url);

contract('comparison-benchmark', {
  spec: 'https://spec.openapis.org/oas/v3.0.3#schema-object',
  fixture: 'comparison-benchmark',
  config: {
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
  },
});
