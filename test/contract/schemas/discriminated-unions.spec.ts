import { surface } from '../harness.js';

const contract = surface(import.meta.url);

contract('discriminated-unions', {
  spec: 'https://spec.openapis.org/oas/v3.0.3#discriminator-object',
  fixture: 'discriminated-unions',
  config: {
    files: {
      entry: 'src/app.module.ts',
      tsconfig: '../../tsconfig.json',
      dtoGlob: 'src/dto.ts',
    },
    openapi: {
      info: {
        title: 'Discriminated Unions API',
        version: '1.0.0',
        description: 'API demonstrating discriminated union type patterns',
      },
    },
  },
});
