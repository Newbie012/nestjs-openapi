import { OPENAPI_VERSIONS, surface } from '../harness.js';

const contract = surface(import.meta.url);

const files = {
  entry: 'src/app.module.ts',
  tsconfig: '../../tsconfig.json',
  dtoGlob: 'src/**/dto.ts',
};
const spec = 'https://spec.openapis.org/oas/v3.0.3#components-object';

contract('complex-generics', {
  spec,
  fixture: 'complex-generics',
  config: {
    files,
    openapi: {
      info: {
        title: 'Complex Generics API',
        version: '1.0.0',
        description: 'API demonstrating complex generic type patterns',
      },
    },
  },
});

contract('complex-generics-raw', {
  spec,
  fixture: 'complex-generics',
  config: {
    files,
    openapi: { info: { title: 'Complex Generics API', version: '1.0.0' } },
    options: { schemas: { genericNames: 'raw' } },
  },
  knownInvalid: OPENAPI_VERSIONS.map((version) => ({
    version,
    reason: 'genericNames: raw is invalid on purpose',
    plan: 'none',
  })),
});
