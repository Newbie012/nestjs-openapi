import { surface } from '../harness.js';

const contract = surface(import.meta.url);

const files = {
  entry: 'src/app.module.ts',
  tsconfig: 'tsconfig.json',
  dtoGlob: 'src/**/*.dto.ts',
};
const spec = 'https://spec.openapis.org/oas/v3.0.3#parameter-object';

contract('query-dto-inlining', {
  spec,
  fixture: 'query-dto-inlining',
  config: {
    files,
    openapi: {
      info: {
        title: 'Query DTO Inlining Test API',
        version: '1.0.0',
        description:
          'Tests query DTO inlining behavior - DTOs should be expanded to individual parameters',
      },
    },
  },
});

contract('query-dto-schema-refs', {
  spec,
  fixture: 'query-dto-inlining',
  config: {
    files,
    options: { query: { style: 'ref' } },
    openapi: {
      info: {
        title: 'Query DTO Schema Refs Test API',
        version: '1.0.0',
        description:
          'Tests query DTO schema ref behavior - DTOs should be kept as single parameters with $ref',
      },
    },
  },
});
