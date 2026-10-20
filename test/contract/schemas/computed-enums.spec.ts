import { surface } from '../harness.js';

const contract = surface(import.meta.url);

contract('computed-enums', {
  spec: 'https://spec.openapis.org/oas/v3.0.3#schema-object',
  fixture: 'computed-enums',
  config: {
    files: {
      entry: 'src/app.module.ts',
      tsconfig: '../tsconfig.json',
      dtoGlob: 'src/**/*.dto.ts',
    },
    openapi: { info: { title: 'Computed enums', version: '1.0.0' } },
  },
});
