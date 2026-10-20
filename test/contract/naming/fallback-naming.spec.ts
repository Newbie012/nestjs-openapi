import { surface } from '../harness.js';

const contract = surface(import.meta.url);

contract('fallback-naming', {
  spec: 'https://spec.openapis.org/oas/v3.0.3#schema-object',
  fixture: 'fallback-naming',
  config: {
    files: {
      entry: 'src/app.module.ts',
      tsconfig: '../tsconfig.json',
      dtoGlob: 'src/**/*.dto.ts',
    },
    openapi: { info: { title: 'Fallback naming', version: '1.0.0' } },
  },
});
