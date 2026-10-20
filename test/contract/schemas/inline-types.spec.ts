import { surface } from '../harness.js';

const contract = surface(import.meta.url);

contract('inline-types', {
  spec: 'https://spec.openapis.org/oas/v3.0.3#schema-object',
  fixture: 'inline-types',
  config: {
    files: { entry: 'src/app.module.ts', tsconfig: '../tsconfig.json' },
    openapi: {
      info: {
        title: 'Inline Types API',
        version: '1.0.0',
        description: 'API demonstrating inline return type extraction',
      },
    },
  },
});
