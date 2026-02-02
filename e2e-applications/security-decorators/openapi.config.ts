import { defineConfig } from '../../src/config.js';

export default defineConfig({
  output: 'openapi.generated.json',

  files: {
    entry: 'src/app.module.ts',
    tsconfig: '../../tsconfig.json',
  },

  openapi: {
    info: {
      title: 'Security Decorators API',
      version: '1.0.0',
      description: 'API demonstrating all security decorator variants',
    },
    security: {
      schemes: [
        // Default bearer scheme (used by @ApiBearerAuth())
        {
          name: 'bearer',
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Default JWT Bearer token',
        },
        // Named JWT scheme (used by @ApiBearerAuth('jwt'))
        {
          name: 'jwt',
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT Bearer token authentication',
        },
        // Basic auth scheme (used by @ApiBasicAuth())
        {
          name: 'basic',
          type: 'http',
          scheme: 'basic',
          description: 'HTTP Basic authentication',
        },
        // API key scheme (used by @ApiSecurity('admin-key'))
        {
          name: 'admin-key',
          type: 'apiKey',
          in: 'header',
          parameterName: 'X-Admin-Key',
          description: 'Admin API key',
        },
        // Stats API key
        {
          name: 'stats-key',
          type: 'apiKey',
          in: 'header',
          parameterName: 'X-Stats-Key',
          description: 'Stats API key',
        },
        // Cookie auth scheme (used by @ApiCookieAuth())
        {
          name: 'cookie',
          type: 'apiKey',
          in: 'cookie',
          parameterName: 'session',
          description: 'Session cookie',
        },
        // OAuth2 scheme (used by @ApiOAuth2)
        {
          name: 'oauth2',
          type: 'oauth2',
          description: 'OAuth2 authentication',
          flows: {
            authorizationCode: {
              authorizationUrl: 'https://example.com/oauth/authorize',
              tokenUrl: 'https://example.com/oauth/token',
              scopes: {
                'read:projects': 'Read project data',
                'write:projects': 'Create and update projects',
                'delete:projects': 'Delete projects',
              },
            },
          },
        },
      ],
      // No global security - all security comes from decorators
    },
  },
});
