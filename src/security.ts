/**
 * Security scheme transformation utilities.
 *
 * Converts config-level security scheme definitions to OpenAPI 3.0 format.
 */

import type {
  SecuritySchemeConfig,
  OpenApiSecurityScheme,
  OpenApiOAuth2Flows,
  OpenApiOAuth2Flow,
} from './types.js';

interface FlowConfig {
  readonly authorizationUrl?: string;
  readonly tokenUrl?: string;
  readonly refreshUrl?: string;
  readonly scopes?: Record<string, string>;
}

/** Build an OAuth2 flow object with optional URLs */
const buildFlow = (
  flow: FlowConfig,
  includeAuthUrl: boolean,
  includeTokenUrl: boolean,
): OpenApiOAuth2Flow => ({
  ...(includeAuthUrl &&
    flow.authorizationUrl && { authorizationUrl: flow.authorizationUrl }),
  ...(includeTokenUrl && flow.tokenUrl && { tokenUrl: flow.tokenUrl }),
  ...(flow.refreshUrl && { refreshUrl: flow.refreshUrl }),
  scopes: flow.scopes ?? {},
});

/** Build OAuth2 flows object from config */
const buildOAuth2Flows = (
  flows: NonNullable<SecuritySchemeConfig['flows']>,
): OpenApiOAuth2Flows => ({
  ...(flows.implicit && { implicit: buildFlow(flows.implicit, true, false) }),
  ...(flows.password && { password: buildFlow(flows.password, false, true) }),
  ...(flows.clientCredentials && {
    clientCredentials: buildFlow(flows.clientCredentials, false, true),
  }),
  ...(flows.authorizationCode && {
    authorizationCode: buildFlow(flows.authorizationCode, true, true),
  }),
});

/**
 * Transforms a SecuritySchemeConfig (our config format) to OpenApiSecurityScheme (OpenAPI format)
 */
export const transformSecurityScheme = (
  config: SecuritySchemeConfig,
): OpenApiSecurityScheme => {
  const scheme: OpenApiSecurityScheme = {
    type: config.type,
    ...(config.description && { description: config.description }),
  };

  switch (config.type) {
    case 'http':
      return {
        ...scheme,
        ...(config.scheme && { scheme: config.scheme }),
        ...(config.bearerFormat && { bearerFormat: config.bearerFormat }),
      };

    case 'apiKey':
      return {
        ...scheme,
        ...(config.in && { in: config.in }),
        ...(config.parameterName && { name: config.parameterName }),
      };

    case 'oauth2':
      if (!config.flows) return scheme;
      return { ...scheme, flows: buildOAuth2Flows(config.flows) };

    case 'openIdConnect':
      return {
        ...scheme,
        ...(config.openIdConnectUrl && {
          openIdConnectUrl: config.openIdConnectUrl,
        }),
      };

    default:
      return scheme;
  }
};

/**
 * Transforms an array of SecuritySchemeConfig to a Record for OpenAPI securitySchemes
 */
export const buildSecuritySchemes = (
  configs: readonly SecuritySchemeConfig[],
): Record<string, OpenApiSecurityScheme> => {
  const schemes: Record<string, OpenApiSecurityScheme> = {};
  for (const config of configs) {
    schemes[config.name] = transformSecurityScheme(config);
  }
  return schemes;
};
