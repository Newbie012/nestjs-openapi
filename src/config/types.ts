/**
 * Public types for nestjs-openapi
 *
 * These types are exposed to consumers of the library. Internal types
 * should be kept in domain.ts.
 */

import type { CustomDecoratorMapping } from '../analysis/decorators.js';

export type {
  CustomDecoratorMapping,
  CustomDecoratorUse,
  DecoratorSpec,
} from '../analysis/decorators.js';

/** A declaration whose schema name another reachable declaration shares */
export interface SchemaNameCollision {
  /** The shared name, e.g. `AddressDto` */
  readonly name: string;
  /** Absolute path of the file declaring this one */
  readonly filePath: string;
  /** The same path, relative to the config file's directory */
  readonly relativePath: string;
  /** Whether the declaration is exported */
  readonly exported: boolean;
  readonly kind: 'class' | 'interface' | 'enum' | 'type';
  /** Every declaration sharing the name, this one included */
  readonly declarations: readonly {
    readonly filePath: string;
    readonly relativePath: string;
    readonly exported: boolean;
  }[];
}

/** Rewrites an operation's documented path */
export type PathTransform = (
  path: string,
  context: {
    /** Controller class name */
    readonly controller: string;
    /** Method name */
    readonly method: string;
    /** Lowercase HTTP method, e.g. `get` */
    readonly httpMethod: string;
  },
) => string;

export type SchemaNameCollisionStrategy =
  | 'inline'
  | 'rename'
  | 'error'
  | ((collision: SchemaNameCollision) => string);

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
 * Input file configuration for nestjs-openapi.
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
   * Rewrites each operation's path, after `basePath`. Paths use OpenAPI
   * syntax (`/users/{id}`). Pair it with `openapi.servers` to move part of the
   * path into the server URL.
   *
   * @example
   * ```typescript
   * // Routes are served under /api, published as https://example.com/api
   * transformPath: (path) => path.replace(/^\/api(?=\/|$)/, '') || '/',
   * ```
   */
  readonly transformPath?: PathTransform;

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
   * What custom decorators mean, in terms of built-in ones.
   *
   * Wrappers written with `applyDecorators()` in your own code are followed
   * automatically. Use this for decorators the generator cannot follow, such
   * as wrappers from a compiled library or with conditional logic. A mapping
   * is a list of decorators, or a function of the arguments the decorator was
   * called with.
   *
   * @example
   * ```typescript
   * decorators: {
   *   // @InternalPort() hides a controller
   *   InternalPort: [{ name: 'ApiExcludeController' }],
   *   // @FilterField(Dto) is an optional nested property of type Dto
   *   FilterField: ({ args: [type] }) => [
   *     { name: 'ApiPropertyOptional', args: [{ type: type ?? typeRef('FilterDto') }] },
   *   ],
   * }
   * ```
   */
  readonly decorators?: Readonly<Record<string, CustomDecoratorMapping>>;

  /**
   * Names of the modules whose controllers are documented, like the `include`
   * option of `SwaggerModule.createDocument()`. Only controllers declared
   * directly in these modules are documented unless `deepScanRoutes` is set.
   * By default, every controller reachable from the entry module is.
   *
   * @example ["ExternalApiModule"]
   */
  readonly include?: readonly string[];

  /**
   * With `include`, also document the controllers of every module the
   * included modules import, like `deepScanRoutes` in
   * `SwaggerModule.createDocument()`.
   *
   * @default false
   */
  readonly deepScanRoutes?: boolean;

  /**
   * What to do when different declarations reached from the documented
   * routes share a name, e.g. two files each declaring their own
   * `AddressDto`. Every reference always points to the declaration it
   * actually uses; this only decides how they are named:
   *
   * - `'inline'`: colliding schemas are written in place instead of as named
   *   components, with a warning listing the declarations.
   * - `'rename'`: each gets its own component, named after its file:
   *   `GetOrderSummary_AddressDto` for `get-order-summary.dto.ts`.
   * - `'error'`: generation fails, listing the colliding declarations.
   * - A function returning the component name for each declaration.
   *
   * @default 'inline'
   */
  readonly schemaNameCollision?: SchemaNameCollisionStrategy;

  /**
   * How enums are emitted.
   *
   * - `'ref'`: every TypeScript enum (and `enum: Status` without `enumName`)
   *   is a component named after it.
   * - `'nest'`: like @nestjs/swagger, enum values are written in place,
   *   unless `enumName` gives them a name: `@ApiProperty({ enum: Status,
   *   enumName: 'Status' })` emits a `Status` component.
   *
   * @default 'ref'
   */
  readonly enums?: 'nest' | 'ref';

  /**
   * Versioning, as passed to `app.enableVersioning()`, which static analysis
   * cannot see. With `type: 'uri'`, paths get the version of their method
   * (`@Version()`) or controller (`@Controller({ version })`), or
   * `defaultVersion`: `/v1/users`. `VERSION_NEUTRAL` (from @nestjs/common)
   * adds no version. Other types do not change paths.
   *
   * @example { type: 'uri', defaultVersion: '1' }
   */
  readonly versioning?: {
    readonly type: 'uri' | 'header' | 'media-type' | 'custom';
    /** URI prefix; `false` for none. @default 'v' */
    readonly prefix?: string | false;
    readonly defaultVersion?: string | symbol | readonly (string | symbol)[];
  };

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

  /**
   * Schema generation and normalization options.
   */
  readonly schemas?: SchemaOptions;
}

/**
 * Schema generation and normalization options.
 */
export interface SchemaOptions {
  /**
   * How to handle schema aliases that only redirect via `$ref`.
   * - `"collapse"`: Rewrite refs to the final target schema and remove alias entries
   * - `"preserve"`: Keep alias schemas as-is
   *
   * @default "collapse"
   */
  readonly aliasRefs?: 'collapse' | 'preserve';

  /**
   * Names of generic instantiations. OpenAPI only allows letters, digits,
   * `.`, `-` and `_` in component names.
   * - `"sanitized"`: `Page<User>` → `Page_User`, `Page<User[]>` →
   *   `Page_UserArray`, `Result<A | B>` → `Result_A_Or_B`
   * - `"raw"`: keep `Page<User>` (not valid OpenAPI, but some tools accept it)
   *
   * @default "sanitized"
   */
  readonly genericNames?: 'sanitized' | 'raw';
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
 * Configuration for nestjs-openapi.
 * Inspired by tsconfig.json and vite.config.ts patterns.
 *
 * @example
 * ```typescript
 * import { defineConfig } from 'nestjs-openapi';
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

  /**
   * Enable debug mode for verbose logging and full stack traces.
   */
  readonly debug?: boolean;

  /**
   * Optional OpenTelemetry tracing for profiling generation performance.
   */
  readonly telemetry?: TelemetryConfig;
}

/**
 * OpenTelemetry tracing options.
 */
export interface TelemetryConfig {
  /**
   * Enable OpenTelemetry tracing.
   * @default false
   */
  readonly enabled?: boolean;

  /**
   * Span exporter backend.
   * - "console": writes spans to stdout
   * - "otlp": sends spans to OTLP HTTP collector
   * @default "console"
   */
  readonly exporter?: 'console' | 'otlp';

  /**
   * OTLP HTTP endpoint.
   * Used only when exporter is "otlp".
   * @default "http://localhost:4318/v1/traces"
   */
  readonly otlpEndpoint?: string;

  /**
   * Service name attached to emitted traces.
   * @default "nestjs-openapi"
   */
  readonly serviceName?: string;
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
  /** 3.1+ replacement for format: 'byte' */
  readonly contentEncoding?: string;
  /** 3.1+ replacement for format: 'binary' */
  readonly contentMediaType?: string;
  // String validation constraints
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  // Number validation constraints
  readonly minimum?: number;
  readonly maximum?: number;
  readonly exclusiveMinimum?: number;
  readonly exclusiveMaximum?: number;
  // Array validation constraints
  readonly minItems?: number;
  readonly maxItems?: number;
  // Default value
  readonly default?: unknown;
  // Additional properties constraint
  readonly additionalProperties?: boolean | OpenApiSchema;
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
