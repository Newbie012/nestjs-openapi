import { describe, it, expect } from 'vitest';
import { transformSecurityScheme, buildSecuritySchemes } from './security.js';
import type { SecuritySchemeConfig } from './types.js';

describe('Security scheme transformation', () => {
  describe('transformSecurityScheme', () => {
    describe('HTTP Bearer authentication', () => {
      it('should transform bearer token config', () => {
        const config: SecuritySchemeConfig = {
          name: 'bearerAuth',
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT Bearer token authentication',
        };

        const result = transformSecurityScheme(config);

        expect(result).toEqual({
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT Bearer token authentication',
        });
      });

      it('should handle bearer without format', () => {
        const config: SecuritySchemeConfig = {
          name: 'bearerAuth',
          type: 'http',
          scheme: 'bearer',
        };

        const result = transformSecurityScheme(config);

        expect(result).toEqual({
          type: 'http',
          scheme: 'bearer',
        });
      });

      it('should handle basic auth', () => {
        const config: SecuritySchemeConfig = {
          name: 'basicAuth',
          type: 'http',
          scheme: 'basic',
        };

        const result = transformSecurityScheme(config);

        expect(result).toEqual({
          type: 'http',
          scheme: 'basic',
        });
      });
    });

    describe('API Key authentication', () => {
      it('should transform API key in header', () => {
        const config: SecuritySchemeConfig = {
          name: 'apiKey',
          type: 'apiKey',
          in: 'header',
          parameterName: 'X-API-Key',
          description: 'API key in header',
        };

        const result = transformSecurityScheme(config);

        expect(result).toEqual({
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key in header',
        });
      });

      it('should transform API key in query', () => {
        const config: SecuritySchemeConfig = {
          name: 'apiKey',
          type: 'apiKey',
          in: 'query',
          parameterName: 'api_key',
        };

        const result = transformSecurityScheme(config);

        expect(result).toEqual({
          type: 'apiKey',
          in: 'query',
          name: 'api_key',
        });
      });

      it('should transform API key in cookie', () => {
        const config: SecuritySchemeConfig = {
          name: 'cookieAuth',
          type: 'apiKey',
          in: 'cookie',
          parameterName: 'session',
        };

        const result = transformSecurityScheme(config);

        expect(result).toEqual({
          type: 'apiKey',
          in: 'cookie',
          name: 'session',
        });
      });
    });

    describe('OAuth2 authentication', () => {
      it('should transform OAuth2 with authorization code flow', () => {
        const config: SecuritySchemeConfig = {
          name: 'oauth2',
          type: 'oauth2',
          description: 'OAuth2 authentication',
          flows: {
            authorizationCode: {
              authorizationUrl: 'https://example.com/oauth/authorize',
              tokenUrl: 'https://example.com/oauth/token',
              refreshUrl: 'https://example.com/oauth/refresh',
              scopes: {
                'read:users': 'Read user data',
                'write:users': 'Modify user data',
              },
            },
          },
        };

        const result = transformSecurityScheme(config);

        expect(result).toEqual({
          type: 'oauth2',
          description: 'OAuth2 authentication',
          flows: {
            authorizationCode: {
              authorizationUrl: 'https://example.com/oauth/authorize',
              tokenUrl: 'https://example.com/oauth/token',
              refreshUrl: 'https://example.com/oauth/refresh',
              scopes: {
                'read:users': 'Read user data',
                'write:users': 'Modify user data',
              },
            },
          },
        });
      });

      it('should transform OAuth2 with implicit flow', () => {
        const config: SecuritySchemeConfig = {
          name: 'oauth2Implicit',
          type: 'oauth2',
          flows: {
            implicit: {
              authorizationUrl: 'https://example.com/oauth/authorize',
              scopes: { 'read:users': 'Read user data' },
            },
          },
        };

        const result = transformSecurityScheme(config);

        expect(result).toEqual({
          type: 'oauth2',
          flows: {
            implicit: {
              authorizationUrl: 'https://example.com/oauth/authorize',
              scopes: { 'read:users': 'Read user data' },
            },
          },
        });
      });

      it('should transform OAuth2 with password flow', () => {
        const config: SecuritySchemeConfig = {
          name: 'oauth2Password',
          type: 'oauth2',
          flows: {
            password: {
              tokenUrl: 'https://example.com/oauth/token',
              scopes: { admin: 'Admin access' },
            },
          },
        };

        const result = transformSecurityScheme(config);

        expect(result).toEqual({
          type: 'oauth2',
          flows: {
            password: {
              tokenUrl: 'https://example.com/oauth/token',
              scopes: { admin: 'Admin access' },
            },
          },
        });
      });

      it('should transform OAuth2 with client credentials flow', () => {
        const config: SecuritySchemeConfig = {
          name: 'oauth2ClientCredentials',
          type: 'oauth2',
          flows: {
            clientCredentials: {
              tokenUrl: 'https://example.com/oauth/token',
              scopes: { 'api:access': 'API access' },
            },
          },
        };

        const result = transformSecurityScheme(config);

        expect(result).toEqual({
          type: 'oauth2',
          flows: {
            clientCredentials: {
              tokenUrl: 'https://example.com/oauth/token',
              scopes: { 'api:access': 'API access' },
            },
          },
        });
      });

      it('should handle OAuth2 with multiple flows', () => {
        const config: SecuritySchemeConfig = {
          name: 'oauth2Multi',
          type: 'oauth2',
          flows: {
            authorizationCode: {
              authorizationUrl: 'https://example.com/oauth/authorize',
              tokenUrl: 'https://example.com/oauth/token',
              scopes: { read: 'Read access' },
            },
            clientCredentials: {
              tokenUrl: 'https://example.com/oauth/token',
              scopes: { admin: 'Admin access' },
            },
          },
        };

        const result = transformSecurityScheme(config);

        expect(result).toEqual({
          type: 'oauth2',
          flows: {
            authorizationCode: {
              authorizationUrl: 'https://example.com/oauth/authorize',
              tokenUrl: 'https://example.com/oauth/token',
              scopes: { read: 'Read access' },
            },
            clientCredentials: {
              tokenUrl: 'https://example.com/oauth/token',
              scopes: { admin: 'Admin access' },
            },
          },
        });
      });

      it('should default scopes to empty object when not provided', () => {
        const config: SecuritySchemeConfig = {
          name: 'oauth2NoScopes',
          type: 'oauth2',
          flows: {
            clientCredentials: {
              tokenUrl: 'https://example.com/oauth/token',
            },
          },
        };

        const result = transformSecurityScheme(config);

        expect(result).toEqual({
          type: 'oauth2',
          flows: {
            clientCredentials: {
              tokenUrl: 'https://example.com/oauth/token',
              scopes: {},
            },
          },
        });
      });
    });

    describe('OpenID Connect authentication', () => {
      it('should transform OpenID Connect config', () => {
        const config: SecuritySchemeConfig = {
          name: 'openIdConnect',
          type: 'openIdConnect',
          openIdConnectUrl:
            'https://example.com/.well-known/openid-configuration',
          description: 'OpenID Connect Discovery',
        };

        const result = transformSecurityScheme(config);

        expect(result).toEqual({
          type: 'openIdConnect',
          openIdConnectUrl:
            'https://example.com/.well-known/openid-configuration',
          description: 'OpenID Connect Discovery',
        });
      });
    });
  });

  describe('buildSecuritySchemes', () => {
    it('should build security schemes record from array of configs', () => {
      const configs: SecuritySchemeConfig[] = [
        {
          name: 'bearerAuth',
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        {
          name: 'apiKey',
          type: 'apiKey',
          in: 'header',
          parameterName: 'X-API-Key',
        },
      ];

      const result = buildSecuritySchemes(configs);

      expect(result).toEqual({
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
        },
      });
    });

    it('should return empty object for empty array', () => {
      const result = buildSecuritySchemes([]);

      expect(result).toEqual({});
    });

    it('should handle single security scheme', () => {
      const configs: SecuritySchemeConfig[] = [
        {
          name: 'bearerAuth',
          type: 'http',
          scheme: 'bearer',
        },
      ];

      const result = buildSecuritySchemes(configs);

      expect(result).toEqual({
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
        },
      });
    });
  });
});
