import { surface } from '../harness.js';

const contract = surface(import.meta.url);

const files = { entry: 'src/app.module.ts', tsconfig: '../tsconfig.json' };
const openapi = { info: { title: 'Versioning API', version: '1.0.0' } };
const spec = 'https://spec.openapis.org/oas/v3.0.3#paths-object';

contract('versioning-uri', {
  spec,
  fixture: 'versioning',
  config: {
    files,
    openapi,
    options: { versioning: { type: 'uri', defaultVersion: '3' } },
  },
});

contract('versioning-header', {
  spec,
  fixture: 'versioning',
  config: { files, openapi, options: { versioning: { type: 'header' } } },
});
