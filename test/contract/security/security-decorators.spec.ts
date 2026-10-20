import { surface } from '../harness.js';

const contract = surface(import.meta.url);

const spec = 'https://spec.openapis.org/oas/v3.0.3#security-requirement-object';
const files = {
  entry: 'src/app.module.ts',
  tsconfig: '../../tsconfig.json',
};

const schemes = [
  {
    name: 'bearer',
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'Default JWT Bearer token',
  },
  {
    name: 'jwt',
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'JWT Bearer token authentication',
  },
  {
    name: 'basic',
    type: 'http',
    scheme: 'basic',
    description: 'HTTP Basic authentication',
  },
  {
    name: 'admin-key',
    type: 'apiKey',
    in: 'header',
    parameterName: 'X-Admin-Key',
    description: 'Admin API key',
  },
  {
    name: 'stats-key',
    type: 'apiKey',
    in: 'header',
    parameterName: 'X-Stats-Key',
    description: 'Stats API key',
  },
  {
    name: 'cookie',
    type: 'apiKey',
    in: 'cookie',
    parameterName: 'session',
    description: 'Session cookie',
  },
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
] as const;

contract('security-decorators', {
  spec,
  fixture: 'security-decorators',
  config: {
    files,
    openapi: {
      info: {
        title: 'Security Decorators API',
        version: '1.0.0',
        description: 'API demonstrating all security decorator variants',
      },
      security: { schemes: [...schemes] },
    },
  },
});

contract('security-decorators-global-merge', {
  spec,
  fixture: 'security-decorators',
  config: {
    files: { ...files, dtoGlob: 'src/**/*.ts' },
    openapi: {
      info: { title: 'Security Merge API', version: '1.0.0' },
      security: {
        schemes: [
          { name: 'bearer', type: 'http', scheme: 'bearer' },
          {
            name: 'apiKey',
            type: 'apiKey',
            in: 'header',
            parameterName: 'X-API-Key',
          },
          {
            name: 'admin-key',
            type: 'apiKey',
            in: 'header',
            parameterName: 'X-Admin-Key',
          },
        ],
        global: [{ bearer: [] }, { apiKey: [] }],
      },
    },
  },
});
