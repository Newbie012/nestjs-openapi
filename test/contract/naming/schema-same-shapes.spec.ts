import { surface } from '../harness.js';

const contract = surface(import.meta.url);

const files = {
  entry: 'src/app.module.ts',
  tsconfig: '../tsconfig.json',
  dtoGlob: 'src/**/*.dto.ts',
};
const openapi = {
  info: { title: 'Schema Same Shapes API', version: '1.0.0' },
};
const spec = 'https://spec.openapis.org/oas/v3.0.3#schema-object';

contract('schema-same-shapes-same', {
  spec,
  fixture: 'schema-same-shapes',
  config: {
    files,
    openapi,
    options: { schemaNameCollision: 'error', pathFilter: /^\/same\// },
  },
});

contract('schema-same-shapes-inline', {
  spec,
  fixture: 'schema-same-shapes',
  config: { files, openapi, options: { schemaNameCollision: 'inline' } },
});

contract('schema-same-shapes-rename', {
  spec,
  fixture: 'schema-same-shapes',
  config: { files, openapi, options: { schemaNameCollision: 'rename' } },
});

contract('schema-same-shapes-error', {
  spec,
  fixture: 'schema-same-shapes',
  config: { files, openapi, options: { schemaNameCollision: 'error' } },
  rejects: { error: 'SchemaNameCollisionError' },
});
