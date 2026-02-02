import { defineConfig } from '../../src/config.js';

export default defineConfig({
  output: 'openapi.generated.json',

  files: {
    entry: 'src/app.module.ts',
    tsconfig: '../../tsconfig.json',
  },

  openapi: {
    info: {
      title: 'Exclude Decorators Test API',
      version: '1.0.0',
      description: 'API demonstrating decorator and path filtering',
    },
  },

  options: {
    // Exclude endpoints marked with @Internal decorator
    // (ApiExcludeEndpoint is already excluded by default)
    excludeDecorators: ['Internal', 'ApiExcludeEndpoint'],
    // Exclude versioned paths like /v2/legacy/*
    // The regex matches paths that should be INCLUDED (those NOT starting with /v followed by digit)
    pathFilter: /^(?!\/v\d+\/).*/,
  },
});
