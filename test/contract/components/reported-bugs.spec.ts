import { surface } from '../harness.js';

const contract = surface(import.meta.url);

const files = {
  entry: 'src/app.module.ts',
  tsconfig: '../tsconfig.json',
  dtoGlob: 'src/**/*.dto.ts',
};
const spec = 'https://spec.openapis.org/oas/v3.0.3#components-object';

contract('reported-bugs', {
  spec,
  fixture: 'reported-bugs',
  config: {
    files,
    openapi: { info: { title: 'Reported Bugs API', version: '1.0.0' } },
  },
});

contract('reported-bugs-schema-error', {
  spec,
  fixture: 'reported-bugs-schema-error',
  config: {
    files,
    openapi: {
      info: { title: 'Reported Bugs Schema Error API', version: '1.0.0' },
    },
  },
});
