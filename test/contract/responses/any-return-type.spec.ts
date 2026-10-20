import { surface } from '../harness.js';

const contract = surface(import.meta.url);

contract('any-return-type', {
  spec: 'https://spec.openapis.org/oas/v3.0.3#response-object',
  fixture: 'any-return-type',
  config: {
    files: {
      entry: 'src/app.module.ts',
      tsconfig: 'tsconfig.json',
      dtoGlob: 'src/**/*.ts',
    },
    openapi: {
      info: {
        title: 'Any Return Type Test API',
        version: '1.0',
        description: 'Testing any return type handling',
      },
    },
  },
});
