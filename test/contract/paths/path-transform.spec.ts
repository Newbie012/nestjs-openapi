import { surface } from '../harness.js';

const contract = surface(import.meta.url);

contract('path-transform', {
  spec: 'https://spec.openapis.org/oas/v3.0.3#paths-object',
  fixture: 'path-transform',
  config: {
    files: { entry: 'src/app.module.ts', tsconfig: '../tsconfig.json' },
    options: {
      transformPath: (path, { controller }) =>
        controller === 'HealthController'
          ? path
          : path.replace(/^\/api(?=\/|$)/, '') || '/',
    },
    openapi: {
      info: { title: 'Path Transform API', version: '1.0.0' },
      servers: [{ url: 'https://app.example.com/api' }],
    },
  },
});
