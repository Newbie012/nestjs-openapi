import { Schema } from 'effect';

// Parameter Types

export const ParameterLocation = Schema.Literal(
  'path',
  'query',
  'header',
  'cookie',
  'body',
);
export type ParameterLocation = typeof ParameterLocation.Type;

/** Validation constraints that can be applied to parameters (plain interface for perf) */
export interface ParameterConstraints {
  // String constraints
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly format?: string;
  // Number constraints
  readonly minimum?: number;
  readonly maximum?: number;
  readonly exclusiveMinimum?: number;
  readonly exclusiveMaximum?: number;
  // Array constraints
  readonly minItems?: number;
  readonly maxItems?: number;
  // Enum constraint
  readonly enum?: readonly unknown[];
  // Type override
  readonly type?: string;
}

export const ResolvedParameter = Schema.Struct({
  name: Schema.String,
  location: ParameterLocation,
  tsType: Schema.String,
  required: Schema.Boolean,
  description: Schema.OptionFromNullOr(Schema.String),
  // Note: constraints uses plain interface to avoid Schema initialization overhead
});
export interface ResolvedParameter extends Schema.Schema.Type<
  typeof ResolvedParameter
> {
  /** Validation constraints from decorators like @Min, @Max, @IsEnum, etc. */
  readonly constraints?: ParameterConstraints;
}

// Return Type

export const ReturnTypeInfo = Schema.Struct({
  type: Schema.OptionFromNullOr(Schema.String),
  inline: Schema.OptionFromNullOr(Schema.String),
  container: Schema.OptionFromNullOr(Schema.Literal('array')),
  filePath: Schema.OptionFromNullOr(Schema.String),
});
export type ReturnTypeInfo = typeof ReturnTypeInfo.Type;

// HTTP Method Info

export const HttpMethod = Schema.Literal(
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'HEAD',
  'ALL',
);
export type HttpMethod = typeof HttpMethod.Type;

/** Metadata extracted from @ApiOperation decorator */
export const OperationMetadata = Schema.Struct({
  /** Custom summary from @ApiOperation({ summary: '...' }) */
  summary: Schema.OptionFromNullOr(Schema.String),
  /** Description from @ApiOperation({ description: '...' }) */
  description: Schema.OptionFromNullOr(Schema.String),
  /** Custom operationId from @ApiOperation({ operationId: '...' }) */
  operationId: Schema.OptionFromNullOr(Schema.String),
  /** Deprecated flag from @ApiOperation({ deprecated: true }) */
  deprecated: Schema.OptionFromNullOr(Schema.Boolean),
});
export type OperationMetadata = typeof OperationMetadata.Type;

/** Metadata extracted from @ApiResponse decorator */
export const ResponseMetadata = Schema.Struct({
  /** HTTP status code (e.g., 200, 201, 400, 404) */
  statusCode: Schema.Number,
  /** Response description */
  description: Schema.OptionFromNullOr(Schema.String),
  /** Response type name (e.g., "UserDto") */
  type: Schema.OptionFromNullOr(Schema.String),
  /** Whether the response type is an array */
  isArray: Schema.Boolean,
});
export type ResponseMetadata = typeof ResponseMetadata.Type;

/**
 * Security requirement extracted from security decorators.
 * Maps security scheme name to required scopes.
 *
 * @example
 * { schemeName: 'bearer', scopes: [] }
 * { schemeName: 'oauth2', scopes: ['read:users', 'write:users'] }
 */
export const MethodSecurityRequirement = Schema.Struct({
  /** Security scheme name (e.g., 'bearer', 'jwt', 'oauth2') */
  schemeName: Schema.String,
  /** Required scopes (empty array for schemes without scopes) */
  scopes: Schema.Array(Schema.String),
});
export type MethodSecurityRequirement = typeof MethodSecurityRequirement.Type;

export const MethodInfo = Schema.Struct({
  httpMethod: HttpMethod,
  path: Schema.String,
  methodName: Schema.String,
  controllerName: Schema.String,
  controllerTags: Schema.Array(Schema.String),
  returnType: ReturnTypeInfo,
  parameters: Schema.Array(ResolvedParameter),
  /** All decorator names on the method (for filtering) */
  decorators: Schema.Array(Schema.String),
  /** Metadata from @ApiOperation decorator */
  operation: OperationMetadata,
  /** Response metadata from @ApiResponse decorators */
  responses: Schema.Array(ResponseMetadata),
  /** Custom HTTP code from @HttpCode decorator */
  httpCode: Schema.OptionFromNullOr(Schema.Number),
  /** Content types from @ApiConsumes decorator (request body content types) */
  consumes: Schema.Array(Schema.String),
  /** Content types from @ApiProduces decorator (response content types) */
  produces: Schema.Array(Schema.String),
  /**
   * Security requirements from decorators (@ApiBearerAuth, @ApiSecurity, etc.)
   * Combines controller-level and method-level security.
   * Multiple requirements = AND logic (all required).
   * Empty array = no security decorators found (inherits global security).
   */
  security: Schema.Array(MethodSecurityRequirement),
});
export type MethodInfo = typeof MethodInfo.Type;

// OpenAPI Types

// Recursive schema for OpenAPI schema objects
export const OpenApiSchemaObject: Schema.Schema<OpenApiSchema> = Schema.suspend(
  () =>
    Schema.Struct({
      type: Schema.optional(Schema.String),
      format: Schema.optional(Schema.String),
      $ref: Schema.optional(Schema.String),
      oneOf: Schema.optional(Schema.Array(OpenApiSchemaObject)),
      items: Schema.optional(OpenApiSchemaObject),
      properties: Schema.optional(
        Schema.Record({ key: Schema.String, value: OpenApiSchemaObject }),
      ),
      required: Schema.optional(Schema.Array(Schema.String)),
    }),
);

export interface OpenApiSchema {
  readonly type?: string;
  readonly format?: string;
  readonly $ref?: string;
  readonly oneOf?: readonly OpenApiSchema[];
  readonly items?: OpenApiSchema;
  readonly properties?: Record<string, OpenApiSchema>;
  readonly required?: readonly string[];
}

export const OpenApiParameter = Schema.Struct({
  name: Schema.String,
  in: Schema.Literal('path', 'query', 'header', 'cookie'),
  description: Schema.optional(Schema.String),
  required: Schema.Boolean,
  schema: OpenApiSchemaObject,
});
export type OpenApiParameter = typeof OpenApiParameter.Type;

export const OpenApiRequestBody = Schema.Struct({
  description: Schema.optional(Schema.String),
  required: Schema.optional(Schema.Boolean),
  content: Schema.Record({
    key: Schema.String,
    value: Schema.Struct({
      schema: Schema.Unknown,
    }),
  }),
});
export type OpenApiRequestBody = typeof OpenApiRequestBody.Type;

export const OpenApiResponse = Schema.Struct({
  description: Schema.String,
  content: Schema.optional(
    Schema.Record({
      key: Schema.String,
      value: Schema.Struct({
        schema: Schema.Unknown,
      }),
    }),
  ),
});
export type OpenApiResponse = typeof OpenApiResponse.Type;

export const OpenApiOperation = Schema.Struct({
  operationId: Schema.String,
  summary: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  deprecated: Schema.optional(Schema.Boolean),
  parameters: Schema.optional(Schema.Array(OpenApiParameter)),
  requestBody: Schema.optional(OpenApiRequestBody),
  responses: Schema.Record({
    key: Schema.String,
    value: OpenApiResponse,
  }),
  tags: Schema.optional(Schema.Array(Schema.String)),
  /** Per-operation security requirements */
  security: Schema.optional(
    Schema.Array(
      Schema.Record({ key: Schema.String, value: Schema.Array(Schema.String) }),
    ),
  ),
});
export type OpenApiOperation = typeof OpenApiOperation.Type;

/** Maps path -> method -> operation */
export interface OpenApiPaths {
  readonly [path: string]: {
    readonly [method: string]: OpenApiOperation;
  };
}

// Config Types

export const OpenApiContactConfig = Schema.Struct({
  name: Schema.optional(Schema.String),
  email: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
});
export type OpenApiContactConfig = typeof OpenApiContactConfig.Type;

export const OpenApiLicenseConfig = Schema.Struct({
  name: Schema.String,
  url: Schema.optional(Schema.String),
});
export type OpenApiLicenseConfig = typeof OpenApiLicenseConfig.Type;

export const OpenApiInfoConfig = Schema.Struct({
  title: Schema.String,
  version: Schema.String,
  description: Schema.optional(Schema.String),
  contact: Schema.optional(OpenApiContactConfig),
  license: Schema.optional(OpenApiLicenseConfig),
});
export type OpenApiInfoConfig = typeof OpenApiInfoConfig.Type;

export const OpenApiServerConfig = Schema.Struct({
  url: Schema.String,
  description: Schema.optional(Schema.String),
});
export type OpenApiServerConfig = typeof OpenApiServerConfig.Type;

export const OpenApiTagConfig = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
});
export type OpenApiTagConfig = typeof OpenApiTagConfig.Type;

export const SecuritySchemeType = Schema.Literal(
  'apiKey',
  'http',
  'oauth2',
  'openIdConnect',
);
export type SecuritySchemeType = typeof SecuritySchemeType.Type;

export const SecuritySchemeIn = Schema.Literal('query', 'header', 'cookie');
export type SecuritySchemeIn = typeof SecuritySchemeIn.Type;

export const SecuritySchemeConfig = Schema.Struct({
  name: Schema.String,
  type: SecuritySchemeType,
  scheme: Schema.optional(Schema.String),
  bearerFormat: Schema.optional(Schema.String),
  in: Schema.optional(SecuritySchemeIn),
  parameterName: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
});
export type SecuritySchemeConfig = typeof SecuritySchemeConfig.Type;

export const SecurityRequirement = Schema.Record({
  key: Schema.String,
  value: Schema.Array(Schema.String),
});
export type SecurityRequirement = typeof SecurityRequirement.Type;

export const OutputFormat = Schema.Literal('json', 'yaml');
export type OutputFormat = typeof OutputFormat.Type;

// Nested config schemas (new structure)

export const FilesConfig = Schema.Struct({
  entry: Schema.optional(
    Schema.Union(Schema.String, Schema.Array(Schema.String)),
  ),
  tsconfig: Schema.optional(Schema.String),
  dtoGlob: Schema.optional(
    Schema.Union(Schema.String, Schema.Array(Schema.String)),
  ),
  include: Schema.optional(Schema.Array(Schema.String)),
  exclude: Schema.optional(Schema.Array(Schema.String)),
});
export type FilesConfig = typeof FilesConfig.Type;

export const SecurityConfig = Schema.Struct({
  schemes: Schema.optional(Schema.Array(SecuritySchemeConfig)),
  global: Schema.optional(Schema.Array(SecurityRequirement)),
});
export type SecurityConfig = typeof SecurityConfig.Type;

export const OpenApiVersion = Schema.Literal('3.0.3', '3.1.0', '3.2.0');
export type OpenApiVersion = typeof OpenApiVersion.Type;

export const OpenApiConfig = Schema.Struct({
  version: Schema.optional(OpenApiVersion),
  info: OpenApiInfoConfig,
  servers: Schema.optional(Schema.Array(OpenApiServerConfig)),
  tags: Schema.optional(Schema.Array(OpenApiTagConfig)),
  security: Schema.optional(SecurityConfig),
});
export type OpenApiConfig = typeof OpenApiConfig.Type;

export const QueryOptionsConfig = Schema.Struct({
  style: Schema.optional(Schema.Literal('inline', 'ref')),
});

export const OptionsConfig = Schema.Struct({
  basePath: Schema.optional(Schema.String),
  extractValidation: Schema.optional(Schema.Boolean),
  excludeDecorators: Schema.optional(Schema.Array(Schema.String)),
  query: Schema.optional(QueryOptionsConfig),
  // Note: pathFilter (RegExp | function) is defined in types.ts but cannot be
  // schema-validated. It's passed through during config loading in config.ts.
});
export type OptionsConfig = typeof OptionsConfig.Type;

export const OpenApiGeneratorConfig = Schema.Struct({
  extends: Schema.optional(Schema.String),
  files: Schema.optional(FilesConfig),
  output: Schema.String,
  format: Schema.optional(OutputFormat),
  openapi: OpenApiConfig,
  options: Schema.optional(OptionsConfig),
});
export type OpenApiGeneratorConfig = typeof OpenApiGeneratorConfig.Type;

export const ResolvedConfig = Schema.Struct({
  tsconfig: Schema.String,
  entry: Schema.Array(Schema.String),
  include: Schema.Array(Schema.String),
  exclude: Schema.Array(Schema.String),
  excludeDecorators: Schema.Array(Schema.String),
  dtoGlob: Schema.Array(Schema.String),
  extractValidation: Schema.Boolean,
  basePath: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
  info: OpenApiInfoConfig,
  servers: Schema.Array(OpenApiServerConfig),
  securitySchemes: Schema.Array(SecuritySchemeConfig),
  securityRequirements: Schema.Array(SecurityRequirement),
  tags: Schema.Array(OpenApiTagConfig),
  output: Schema.String,
  format: OutputFormat,
});
export type ResolvedConfig = typeof ResolvedConfig.Type;
