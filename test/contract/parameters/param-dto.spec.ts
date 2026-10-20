import { surface } from '../harness.js';

const contract = surface(import.meta.url);

contract('param-dto', {
  spec: 'https://spec.openapis.org/oas/v3.0.3#parameter-object',
  fixture: 'param-dto',
  config: {
    files: {
      entry: 'src/app.module.ts',
      tsconfig: '../tsconfig.json',
      dtoGlob: 'src/**/*.dto.ts',
    },
    openapi: { info: { title: 'Param DTO API', version: '1.0.0' } },
  },
});
