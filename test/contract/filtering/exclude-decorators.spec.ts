import { surface } from '../harness.js';

const contract = surface(import.meta.url);

contract('exclude-decorators', {
  spec: 'https://spec.openapis.org/oas/v3.0.3#paths-object',
  fixture: 'exclude-decorators',
  config: {
    files: { entry: 'src/app.module.ts', tsconfig: '../../tsconfig.json' },
    options: {
      excludeDecorators: ['Internal', 'InternalPort', 'ApiExcludeEndpoint'],
      pathFilter: /^(?!\/v\d+\/).*/,
    },
    openapi: {
      info: {
        title: 'Exclude Decorators Test API',
        version: '1.0.0',
        description: 'API demonstrating decorator and path filtering',
      },
    },
  },
});
