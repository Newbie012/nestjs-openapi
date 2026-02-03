/**
 * Public types for nestjs-openapi-static
 *
 * These types are exposed to consumers of the library. Internal types
 * should be kept in domain.ts.
 */

/**
 * Contact information for the API
 */
export interface ContactConfig {
  readonly name?: string;
  readonly email?: string;
  readonly url?: string;
}

/**
 * License information for the API
 */
export interface LicenseConfig {
  readonly name: string;
  readonly url?: string;
}

/**
 * API metadata for the OpenAPI info section
 */
export interface InfoConfig {
  readonly title: string;
  readonly version: string;
  readonly description?: string;
  readonly contact?: ContactConfig;
  readonly license?: LicenseConfig;
}

/**
 * Server configuration for the OpenAPI servers section
 */
export interface ServerConfig {
  readonly url: string;
  readonly description?: string;
}

/**
 * Tag configuration for organizing API endpoints
 */
export interface TagConfig {
  readonly name: string;
  readonly description?: string;
}

/**
 * Security scheme type for OpenAPI 3.0
 */
export type SecuritySchemeType = 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';

/**
 * Location for apiKey security schemes
 */
export type SecuritySchemeIn = 'query' | 'header' | 'cookie';

/**
 * OAuth2 flow configuration
 */
export interface OAuth2FlowConfig {
  readonly authorizationUrl?: string;
  readonly tokenUrl?: string;
  readonly refreshUrl?: string;
  readonly scopes?: Record<string, string>;
}

/**
 * OAuth2 flows configuration
 */
export interface OAuth2FlowsConfig {
  readonly implicit?: OAuth2FlowConfig;
  readonly password?: OAuth2FlowConfig;
  readonly clientCredentials?: OAuth2FlowConfig;
  readonly authorizationCode?: OAuth2FlowConfig;
}

/**
 * Security scheme configuration for OpenAPI 3.0
 *
 * @example
 * ```typescript
 * // Bearer token (JWT)
 * {
 *   name: 'bearerAuth',
 *   type: 'http',
 *   scheme: 'bearer',
 *   bearerFormat: 'JWT',
 * }
 *
 * // API Key in header
 * {
 *   name: 'apiKey',
 *   type: 'apiKey',
 *   in: 'header',
 *   parameterName: 'X-API-Key',
 * }
 *
 * // OAuth2
 * {
 *   name: 'oauth2',
 *   type: 'oauth2',
 *   flows: {
 *     authorizationCode: {
 *       authorizationUrl: 'https://example.com/oauth/authorize',
 *       tokenUrl: 'https://example.com/oauth/token',
 *       scopes: { 'read:users': 'Read user data' },
 *     },
 *   },
 * }
 * ```
 */
export interface SecuritySchemeConfig {
  /** Unique name for this security scheme (used as key in securitySchemes) */
  readonly name: string;
  /** The type of the security scheme */
  readonly type: SecuritySchemeType;
  /** Description of the security scheme */
  readonly description?: string;
  /** The name of the HTTP Authorization scheme (for type: 'http') */
  readonly scheme?: string;
  /** A hint for the format of the token (for type: 'http' with scheme: 'bearer') */
  readonly bearerFormat?: string;
  /** The location of the API key (for type: 'apiKey') */
  readonly in?: SecuritySchemeIn;
  /** The name of the header, query, or cookie parameter (for type: 'apiKey') */
  readonly parameterName?: string;
  /** OAuth2 flows configuration (for type: 'oauth2') */
  readonly flows?: OAuth2FlowsConfig;
  /** OpenID Connect URL to discover OAuth2 config (for type: 'openIdConnect') */
  readonly openIdConnectUrl?: string;
}

/**
 * Security requirement - maps security scheme names to required scopes
 *
 * @example
 * ```typescript
 * // Require bearerAuth with no specific scopes
 * { bearerAuth: [] }
 *
 * // Require oauth2 with specific scopes
 * { oauth2: ['read:users', 'write:users'] }
 * ```
 */
export type SecurityRequirement = Record<string, readonly string[]>;

/**
 * Output format for the generated OpenAPI specification
 */
export type OutputFormat = 'json' | 'yaml';

/**
 * OpenAPI specification version
 * - '3.0.3': OpenAPI 3.0.3 (default, widely supported)
 * - '3.1.0': OpenAPI 3.1.0 (full JSON Schema 2020-12 alignment, type arrays for nullable)
 * - '3.2.0': OpenAPI 3.2.0 (when released, will include webhooks and other new features)
 */
export type OpenApiVersion = '3.0.3' | '3.1.0' | '3.2.0';

/**
 * Input file configuration for nestjs-openapi-static.
 * All paths are relative to the config file location.
 */
export interface FilesConfig {
  /**
   * Entry module file(s).
   * @default "src/app.module.ts"
   */
  readonly entry?: string | readonly string[];

  /**
   * Path to tsconfig.json. Auto-detected if not specified.
   */
  readonly tsconfig?: string;

  /**
   * Glob pattern(s) for DTO files to generate schemas from.
   * @example "src/**\/*.dto.ts"
   */
  readonly dtoGlob?: string | readonly string[];

  /**
   * Glob patterns to include.
   */
  readonly include?: readonly string[];

  /**
   * Glob patterns to exclude.
   * @default ["**\/*.spec.ts", "**\/*.test.ts", "**\/node_modules/**"]
   */
  readonly exclude?: readonly string[];
}

/**
 * Security configuration for OpenAPI spec.
 */
export interface SecurityConfig {
  /**
   * Security schemes available for the API.
   * Defines authentication methods (bearer, apiKey, oauth2, etc.)
   */
  readonly schemes?: readonly SecuritySchemeConfig[];

  /**
   * Global security requirements applied to all operations.
   * Can be overridden at the operation level.
   * Each object in the array represents an alternative (OR logic).
   * Within each object, all schemes must be satisfied (AND logic).
   *
   * @example
   * ```typescript
   * // Require bearerAuth for all operations
   * global: [{ bearerAuth: [] }]
   *
   * // Allow either bearerAuth OR apiKey
   * global: [{ bearerAuth: [] }, { apiKey: [] }]
   * ```
   */
  readonly global?: readonly SecurityRequirement[];
}

/**
 * OpenAPI specification metadata configuration.
 * Maps directly to the OpenAPI spec structure.
 */
export interface OpenApiConfig {
  /**
   * OpenAPI specification version.
   * @default "3.0.3"
   */
  readonly version?: OpenApiVersion;

  /**
   * API metadata for the info section.
   * @required
   */
  readonly info: InfoConfig;

  /**
   * Server URLs for the API.
   */
  readonly servers?: readonly ServerConfig[];

  /**
   * Tags for organizing API endpoints.
   */
  readonly tags?: readonly TagConfig[];

  /**
   * Security configuration.
   */
  readonly security?: SecurityConfig;
}

/**
 * Generation behavior options.
 */
export interface OptionsConfig {
  /**
   * Base path prefix for all routes.
   * Equivalent to NestJS's app.setGlobalPrefix().
   * @example "/api/v1"
   */
  readonly basePath?: string;

  /**
   * Extract validation constraints from class-validator decorators.
   * @default true
   */
  readonly extractValidation?: boolean;

  /**
   * Decorator names that exclude endpoints from the spec.
   * @default ["ApiExcludeEndpoint", "ApiExcludeController"]
   */
  readonly excludeDecorators?: readonly string[];

  /**
   * Filter paths by regex or predicate function.
   * Paths matching the regex (or returning true) are INCLUDED.
   *
   * @example
   * ```typescript
   * // Exclude internal and versioned paths
   * pathFilter: /^(?!.*(\/internal\/|\/v[\d.]+\/)).* /
   *
   * // Using a function
   * pathFilter: (path) => !path.includes('/internal/')
   * ```
   */
  readonly pathFilter?: RegExp | ((path: string) => boolean);

  /**
   * Query parameter handling options.
   */
  readonly query?: QueryOptions;
}

/**
 * Query parameter handling options.
 */
export interface QueryOptions {
  /**
   * How to represent query object DTOs (e.g., `@Query() dto: PaginationDto`).
   * - `"inline"` (default): Expand DTO properties as individual query parameters
   * - `"ref"`: Keep as a single parameter with a schema reference
   *
   * @default "inline"
   *
   * @example
   * ```typescript
   * // With style: "inline" (default)
   * // @Query() dto: PaginationDto becomes:
   * // - page: integer (query)
   * // - limit: integer (query)
   *
   * // With style: "ref"
   * // @Query() dto: PaginationDto becomes:
   * // - dto: $ref to PaginationDto schema (query)
   * ```
   */
  readonly style?: 'inline' | 'ref';
}

/**
 * Configuration for nestjs-openapi-static.
 * Inspired by tsconfig.json and vite.config.ts patterns.
 *
 * @example
 * ```typescript
 * import { defineConfig } from 'nestjs-openapi-static';
 *
 * export default defineConfig({
 *   output: 'src/openapi/openapi.generated.json',
 *
 *   files: {
 *     entry: 'src/app.module.ts',
 *     dtoGlob: 'src/**\/*.dto.ts',
 *   },
 *
 *   openapi: {
 *     info: {
 *       title: 'My API',
 *       version: '1.0.0',
 *     },
 *   },
 *
 *   options: {
 *     basePath: '/api',
 *     extractValidation: true,
 *   },
 * });
 * ```
 */
export interface Config {
  /**
   * Extend another config file. Paths are relative to this config file.
   * Extended config values are deeply merged, with this config taking precedence.
   * @example extends: './configs/base-openapi.config.ts'
   */
  readonly extends?: string;

  /**
   * Input file configuration.
   * All paths are relative to the config file location.
   */
  readonly files?: FilesConfig;

  /**
   * Output path for the generated OpenAPI specification.
   * Path is relative to the config file location.
   * @required
   */
  readonly output: string;

  /**
   * Output format for the specification.
   * @default "json"
   */
  readonly format?: OutputFormat;

  /**
   * OpenAPI specification metadata.
   * Maps directly to the OpenAPI spec structure.
   * @required
   */
  readonly openapi: OpenApiConfig;

  /**
   * Generation behavior options.
   */
  readonly options?: OptionsConfig;
}

/**
 * Options for the generate function to override config values.
 * Useful for CLI overrides.
 */
export interface GenerateOverrides {
  /**
   * Override the output format.
   * Takes precedence over config.format.
   */
  readonly format?: OutputFormat;
}

/**
 * OpenAPI 3.0/3.1/3.2 specification schema object
 * Type can be a string or array of strings (for nullable in 3.1+)
 */
export interface OpenApiSchema {
  /** Schema type - string or array for 3.1+ nullable (e.g., ['string', 'null']) */
  readonly type?: string | readonly string[];
  readonly format?: string;
  readonly $ref?: string;
  readonly oneOf?: readonly OpenApiSchema[];
  readonly anyOf?: readonly OpenApiSchema[];
  readonly allOf?: readonly OpenApiSchema[];
  readonly items?: OpenApiSchema;
  readonly properties?: Record<string, OpenApiSchema>;
  readonly required?: readonly string[];
  readonly enum?: readonly unknown[];
  readonly description?: string;
  /** OpenAPI 3.0 only - use type: [T, 'null'] in 3.1+ instead */
  readonly nullable?: boolean;
  /** Examples array for 3.1+ (replaces single 'example' field) */
  readonly examples?: readonly unknown[];
}

/**
 * OpenAPI 3.0 parameter object
 */
export interface OpenApiParameter {
  readonly name: string;
  readonly in: 'path' | 'query' | 'header' | 'cookie';
  readonly description?: string;
  readonly required: boolean;
  readonly schema: OpenApiSchema;
}

/**
 * OpenAPI 3.0 request body object
 */
export interface OpenApiRequestBody {
  readonly description?: string;
  readonly required?: boolean;
  readonly content: Record<string, { readonly schema: OpenApiSchema }>;
}

/**
 * OpenAPI 3.0 response object
 */
export interface OpenApiResponse {
  readonly description: string;
  readonly content?: Record<string, { readonly schema: OpenApiSchema }>;
}

/**
 * OpenAPI 3.0 operation object
 */
export interface OpenApiOperation {
  readonly operationId: string;
  readonly summary?: string;
  readonly description?: string;
  readonly deprecated?: boolean;
  readonly tags?: readonly string[];
  readonly parameters?: readonly OpenApiParameter[];
  readonly requestBody?: OpenApiRequestBody;
  readonly responses: Record<string, OpenApiResponse>;
  /** Per-operation security requirements (overrides global security) */
  readonly security?: readonly SecurityRequirement[];
}

/**
 * OpenAPI 3.0 paths object
 * Maps path patterns to HTTP method operations
 */
export interface OpenApiPaths {
  readonly [path: string]: {
    readonly [method: string]: OpenApiOperation;
  };
}

/**
 * OpenAPI 3.0 OAuth2 flow object
 */
export interface OpenApiOAuth2Flow {
  readonly authorizationUrl?: string;
  readonly tokenUrl?: string;
  readonly refreshUrl?: string;
  readonly scopes: Record<string, string>;
}

/**
 * OpenAPI 3.0 OAuth2 flows object
 */
export interface OpenApiOAuth2Flows {
  readonly implicit?: OpenApiOAuth2Flow;
  readonly password?: OpenApiOAuth2Flow;
  readonly clientCredentials?: OpenApiOAuth2Flow;
  readonly authorizationCode?: OpenApiOAuth2Flow;
}

/**
 * OpenAPI 3.0 security scheme object
 */
export interface OpenApiSecurityScheme {
  readonly type: SecuritySchemeType;
  readonly description?: string;
  /** The name of the HTTP Authorization scheme (for type: 'http') */
  readonly scheme?: string;
  /** A hint for the format of the token (for type: 'http' with scheme: 'bearer') */
  readonly bearerFormat?: string;
  /** The location of the API key (for type: 'apiKey') */
  readonly in?: SecuritySchemeIn;
  /** The name of the header, query, or cookie parameter (for type: 'apiKey') */
  readonly name?: string;
  /** OAuth2 flows (for type: 'oauth2') */
  readonly flows?: OpenApiOAuth2Flows;
  /** OpenID Connect URL (for type: 'openIdConnect') */
  readonly openIdConnectUrl?: string;
}

/**
 * Webhook operation for OpenAPI 3.1+
 * Similar to regular operations but accessed via events rather than HTTP methods
 */
export interface OpenApiWebhookOperation {
  readonly post?: OpenApiOperation;
  readonly put?: OpenApiOperation;
  readonly patch?: OpenApiOperation;
  readonly delete?: OpenApiOperation;
  readonly get?: OpenApiOperation;
}

/**
 * Complete OpenAPI 3.0/3.1/3.2 specification
 */
export interface OpenApiSpec {
  readonly openapi: OpenApiVersion;
  readonly info: {
    readonly title: string;
    readonly version: string;
    readonly description?: string;
    readonly contact?: ContactConfig;
    readonly license?: LicenseConfig;
  };
  readonly servers?: readonly ServerConfig[];
  readonly tags?: readonly TagConfig[];
  readonly paths: OpenApiPaths;
  /** Webhooks for OpenAPI 3.1+ - event-driven operations */
  readonly webhooks?: Record<string, OpenApiWebhookOperation>;
  readonly components?: {
    readonly schemas?: Record<string, OpenApiSchema>;
    readonly securitySchemes?: Record<string, OpenApiSecurityScheme>;
  };
  /** Global security requirements */
  readonly security?: readonly SecurityRequirement[];
}
