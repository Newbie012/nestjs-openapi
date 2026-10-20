import { surface } from '../harness.js';

const contract = surface(import.meta.url);

const files = { entry: 'src/app.module.ts', tsconfig: '../tsconfig.json' };
const openapi = { info: { title: 'Module Scope API', version: '1.0.0' } };
const spec = 'https://spec.openapis.org/oas/v3.0.3#paths-object';

contract('module-scope-all', {
  spec,
  fixture: 'module-scope',
  config: { files, openapi },
});

contract('module-scope-include', {
  spec,
  fixture: 'module-scope',
  config: { files, openapi, options: { include: ['ExternalApiModule'] } },
});

contract('module-scope-deep', {
  spec,
  fixture: 'module-scope',
  config: {
    files,
    openapi,
    options: { include: ['ExternalApiModule'], deepScanRoutes: true },
  },
});
