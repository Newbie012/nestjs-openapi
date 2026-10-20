import { OPENAPI_VERSIONS, surface } from '../harness.js';

const contract = surface(import.meta.url);

const files = {
  entry: 'src/app.module.ts',
  tsconfig: '../tsconfig.json',
  dtoGlob: 'src/**/*.dto.ts',
};
const openapi = { info: { title: 'Regressions API', version: '1.0.0' } };
const spec = 'https://spec.openapis.org/oas/v3.0.3#components-object';

contract('regressions', {
  spec,
  fixture: 'regressions',
  config: { files, openapi },
});

contract('regressions-alias-refs', {
  spec,
  fixture: 'regressions',
  config: { files, openapi, options: { schemas: { aliasRefs: 'preserve' } } },
});

contract('regressions-raw', {
  spec,
  fixture: 'regressions',
  config: { files, openapi, options: { schemas: { genericNames: 'raw' } } },
  knownInvalid: OPENAPI_VERSIONS.map((version) => ({
    version,
    reason: 'genericNames: raw is invalid on purpose',
    plan: 'none',
  })),
});
