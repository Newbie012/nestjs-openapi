import { surface } from '../harness.js';

const contract = surface(import.meta.url);

contract('dto-validation', {
  spec: 'https://spec.openapis.org/oas/v3.0.3#schema-object',
  fixture: 'dto-validation',
  config: {
    files: {
      entry: 'src/app.module.ts',
      tsconfig: '../../tsconfig.json',
      dtoGlob: 'src/**/*.dto.ts',
    },
    options: { extractValidation: true },
    openapi: {
      info: {
        title: 'DTO Validation API',
        version: '1.0.0',
        description: 'API demonstrating DTO validation with class-validator',
      },
    },
  },
});
