import { defineConfig } from '../../src/config/config.js';

export default defineConfig({
  output: 'openapi.generated.json',

  files: {
    entry: 'src/app.module.ts',
    tsconfig: '../tsconfig.json',
  },

  openapi: {
    info: {
      title: 'Path Transform API',
      version: '1.0.0',
    },
    // The /api prefix moves from the paths to the server URL
    servers: [{ url: 'https://app.example.com/api' }],
  },

  options: {
    transformPath: (path, { controller }) =>
      controller === 'HealthController'
        ? path
        : path.replace(/^\/api(?=\/|$)/, '') || '/',
  },
});
