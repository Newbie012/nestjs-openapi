import { surface } from '../harness.js';

const contract = surface(import.meta.url);

const files = {
  entry: 'src/app.module.ts',
  tsconfig: '../tsconfig.json',
  dtoGlob: 'src/**/*.dto.ts',
};
const openapi = { info: { title: 'Schema Collisions API', version: '1.0.0' } };
const spec = 'https://spec.openapis.org/oas/v3.0.3#schema-object';

contract('schema-collisions-inline', {
  spec,
  fixture: 'schema-collisions',
  config: { files, openapi },
});

contract('schema-collisions-rename', {
  spec,
  fixture: 'schema-collisions',
  config: { files, openapi, options: { schemaNameCollision: 'rename' } },
});

contract('schema-collisions-function', {
  spec,
  fixture: 'schema-collisions',
  config: {
    files,
    openapi,
    options: {
      schemaNameCollision: ({ name, relativePath }) => {
        const feature = relativePath.split('/')[1] ?? '';
        const folder = relativePath.split('/').at(-2) ?? '';
        const prefix = feature === 'plugins' ? folder : feature;
        return `${prefix.charAt(0).toUpperCase()}${prefix.slice(1)}${name}`;
      },
    },
  },
});

contract('schema-collisions-error', {
  spec,
  fixture: 'schema-collisions',
  config: { files, openapi, options: { schemaNameCollision: 'error' } },
  rejects: { error: 'SchemaNameCollisionError' },
});

contract('schema-collisions-shadowed', {
  spec,
  fixture: 'schema-collisions',
  config: { files, openapi, options: { pathFilter: /^\/orders/ } },
});

contract('schema-collisions-outside-glob', {
  spec,
  fixture: 'schema-collisions',
  config: {
    files: {
      entry: 'src/outside-glob/app.module.ts',
      tsconfig: '../tsconfig.json',
      dtoGlob: 'src/outside-glob/**/*.dto.ts',
    },
    openapi,
    options: {
      schemas: { additionalProperties: 'forbid' },
      pathFilter: (path) => !path.includes('/internal/'),
    },
  },
});
