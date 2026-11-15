import { surface } from '../harness.js';

const contract = surface(import.meta.url);

const files = {
  entry: 'src/app.module.ts',
  tsconfig: '../tsconfig.json',
  dtoGlob: 'src/**/*.dto.ts',
};
const openapi = { info: { title: 'Schema Name API', version: '1.0.0' } };
const spec = 'https://spec.openapis.org/oas/v3.0.3#components-object';

const stripPublicDto = ({
  name,
  relativePath,
}: {
  readonly name: string;
  readonly relativePath: string;
}) =>
  relativePath.startsWith('src/public/') ? name.replace(/Dto$/, '') : name;

const withoutAdminUsers = (path: string) => path !== '/admin/users';

contract('schema-name-default', {
  spec,
  fixture: 'schema-name',
  config: { files, openapi },
});

contract('schema-name-path-scoped', {
  spec,
  fixture: 'schema-name',
  config: {
    files,
    openapi,
    options: { schemaName: stripPublicDto, pathFilter: withoutAdminUsers },
  },
});

contract('schema-name-kinds', {
  spec,
  fixture: 'schema-name',
  config: {
    files,
    openapi,
    options: {
      schemaName: ({ name, kind }) =>
        kind === 'enum' ? `${name}Enum` : `Api${name}`,
    },
  },
});

contract('schema-name-collision-rename', {
  spec,
  fixture: 'schema-name',
  config: {
    files,
    openapi,
    options: { schemaName: stripPublicDto, schemaNameCollision: 'rename' },
  },
});

contract('schema-name-collision-error', {
  spec,
  fixture: 'schema-name',
  config: {
    files,
    openapi,
    options: { schemaName: stripPublicDto, schemaNameCollision: 'error' },
  },
  rejects: { error: 'SchemaNameCollisionError' },
});
