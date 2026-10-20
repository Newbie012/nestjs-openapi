import { Schema } from 'effect';
import type { CustomDecoratorMapping } from '../analysis/decorators.js';
import type {
  OperationExtensionsHook,
  PathTransform,
  SchemaNameCollision,
} from '../config/types.js';

type CustomDecoratorMappingFunction = Extract<
  CustomDecoratorMapping,
  (...args: never[]) => unknown
>;

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
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly format?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly exclusiveMinimum?: number | boolean;
  readonly exclusiveMaximum?: number | boolean;
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly enum?: readonly unknown[];
  readonly type?: string;
  readonly description?: string;
  readonly isArray?: boolean;
}

export const ResolvedParameter = Schema.Struct({
  name: Schema.String,
  location: ParameterLocation,
  tsType: Schema.String,
  required: Schema.Boolean,
  description: Schema.OptionFromNullOr(Schema.String),
});
export interface ResolvedParameter extends Schema.Schema.Type<
  typeof ResolvedParameter
> {
  /** Validation constraints from decorators like @Min, @Max, @IsEnum, etc. */
  readonly constraints?: ParameterConstraints;
  readonly declaredSchema?: object;
  readonly extra?: Readonly<Record<string, unknown>>;
}

export const ReturnTypeInfo = Schema.Struct({
  type: Schema.OptionFromNullOr(Schema.String),
  inline: Schema.OptionFromNullOr(Schema.String),
  container: Schema.OptionFromNullOr(Schema.Literal('array')),
  filePath: Schema.OptionFromNullOr(Schema.String),
});
export type ReturnTypeInfo = typeof ReturnTypeInfo.Type;

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

/** Metadata extracted from @ApiResponse and its shortcuts (@ApiOkResponse...) */
export const ResponseMetadata = Schema.Struct({
  /** HTTP status code (e.g., 200, 201, 400, 404), or "default" */
  statusCode: Schema.Union(Schema.Number, Schema.Literal('default')),
  /** Response description */
  description: Schema.OptionFromNullOr(Schema.String),
  /** Response type name (e.g., "UserDto") */
  type: Schema.OptionFromNullOr(Schema.String),
  /** Whether the response type is an array */
  isArray: Schema.Boolean,
  schema: Schema.optional(Schema.Unknown),
  /** Declared content map, by media type, used when no type or schema is */
  content: Schema.optional(Schema.Unknown),
});
export type ResponseMetadata = typeof ResponseMetadata.Type;

export const DeclarationRef = Schema.Struct({
  name: Schema.String,
  filePath: Schema.String,
  exported: Schema.Boolean,
  kind: Schema.Literal('class', 'interface', 'enum', 'type'),
  topLevel: Schema.Boolean,
  localNames: Schema.optional(Schema.Array(Schema.String)),
  generic: Schema.optional(Schema.Boolean),
});
export type DeclarationRef = typeof DeclarationRef.Type;

export const RequestBodyMetadata = Schema.Struct({
  type: Schema.OptionFromNullOr(Schema.String),
  isArray: Schema.Boolean,
  description: Schema.OptionFromNullOr(Schema.String),
  required: Schema.OptionFromNullOr(Schema.Boolean),
  schema: Schema.optional(Schema.Unknown),
});
export type RequestBodyMetadata = typeof RequestBodyMetadata.Type;

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

const DecoratorUse = Schema.Struct({
  name: Schema.String,
  args: Schema.Array(Schema.Unknown),
});

/** Where an operation came from, read only for `operationExtensions` */
export const MethodSource = Schema.Struct({
  entry: Schema.String,
  module: Schema.String,
  methodDecorators: Schema.Array(DecoratorUse),
  controllerDecorators: Schema.Array(DecoratorUse),
});
export type MethodSource = typeof MethodSource.Type;

export const MethodInfo = Schema.Struct({
  httpMethod: HttpMethod,
  path: Schema.String,
  methodName: Schema.String,
  controllerName: Schema.String,
  controllerFile: Schema.optional(Schema.String),
  controllerTags: Schema.Array(Schema.String),
  returnType: ReturnTypeInfo,
  parameters: Schema.Array(ResolvedParameter),
  /** All decorator names on the controller and method (for filtering) */
  decorators: Schema.Array(Schema.String),
  excluded: Schema.optional(Schema.Boolean),
  /** Metadata from @ApiOperation decorator */
  operation: OperationMetadata,
  /** Response metadata from @ApiResponse decorators */
  responses: Schema.Array(ResponseMetadata),
  requestBody: Schema.optional(RequestBodyMetadata),
  operationKey: Schema.optional(Schema.String),
  extensions: Schema.optional(
    Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  ),
  extraModels: Schema.optional(Schema.Array(Schema.String)),
  source: Schema.optional(MethodSource),
  referencedDeclarations: Schema.optional(Schema.Array(DeclarationRef)),
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

export const OAuth2FlowConfig = Schema.Struct({
  authorizationUrl: Schema.optional(Schema.String),
  tokenUrl: Schema.optional(Schema.String),
  refreshUrl: Schema.optional(Schema.String),
  scopes: Schema.optional(
    Schema.Record({ key: Schema.String, value: Schema.String }),
  ),
});
export type OAuth2FlowConfig = typeof OAuth2FlowConfig.Type;

export const OAuth2FlowsConfig = Schema.Struct({
  implicit: Schema.optional(OAuth2FlowConfig),
  password: Schema.optional(OAuth2FlowConfig),
  clientCredentials: Schema.optional(OAuth2FlowConfig),
  authorizationCode: Schema.optional(OAuth2FlowConfig),
});
export type OAuth2FlowsConfig = typeof OAuth2FlowsConfig.Type;

const HttpSecuritySchemeConfig = Schema.Struct({
  name: Schema.String,
  type: Schema.Literal('http'),
  scheme: Schema.String,
  bearerFormat: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
});

const ApiKeySecuritySchemeConfig = Schema.Struct({
  name: Schema.String,
  type: Schema.Literal('apiKey'),
  in: SecuritySchemeIn,
  parameterName: Schema.String,
  description: Schema.optional(Schema.String),
});

const OAuth2SecuritySchemeConfig = Schema.Struct({
  name: Schema.String,
  type: Schema.Literal('oauth2'),
  flows: OAuth2FlowsConfig,
  description: Schema.optional(Schema.String),
});

const OpenIdConnectSecuritySchemeConfig = Schema.Struct({
  name: Schema.String,
  type: Schema.Literal('openIdConnect'),
  openIdConnectUrl: Schema.String,
  description: Schema.optional(Schema.String),
});

export const SecuritySchemeConfig = Schema.Union(
  HttpSecuritySchemeConfig,
  ApiKeySecuritySchemeConfig,
  OAuth2SecuritySchemeConfig,
  OpenIdConnectSecuritySchemeConfig,
);
export type SecuritySchemeConfig = typeof SecuritySchemeConfig.Type;

export const SecurityRequirement = Schema.Record({
  key: Schema.String,
  value: Schema.Array(Schema.String),
});

export const OutputFormat = Schema.Literal('json', 'yaml');
export type OutputFormat = typeof OutputFormat.Type;

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
export type QueryOptionsConfig = typeof QueryOptionsConfig.Type;

export const SchemaOptionsConfig = Schema.Struct({
  aliasRefs: Schema.optional(Schema.Literal('collapse', 'preserve')),
  genericNames: Schema.optional(Schema.Literal('sanitized', 'raw')),
  additionalProperties: Schema.optional(Schema.Literal('omit', 'forbid')),
});
export type SchemaOptionsConfig = typeof SchemaOptionsConfig.Type;

const PathFilterFunction = Schema.declare(
  (input: unknown): input is (path: string) => boolean =>
    typeof input === 'function',
  {
    identifier: 'PathFilterFunction',
    description: 'A function that takes a path string and returns a boolean',
  },
);

export const PathFilter = Schema.Union(
  Schema.instanceOf(RegExp),
  PathFilterFunction,
);
export type PathFilter = typeof PathFilter.Type;

const functionSchema = <F>(identifier: string, description: string) =>
  Schema.declare((input: unknown): input is F => typeof input === 'function', {
    identifier,
    description,
  });

const DecoratorSpecConfig = Schema.Struct({
  name: Schema.String,
  args: Schema.optional(Schema.Array(Schema.Unknown)),
});

const DecoratorMappingConfig = Schema.Union(
  Schema.Array(DecoratorSpecConfig),
  functionSchema<CustomDecoratorMappingFunction>(
    'DecoratorMappingFunction',
    'A function that takes a custom decorator use and returns the decorators it stands for',
  ),
);

export const OptionsConfig = Schema.Struct({
  basePath: Schema.optional(Schema.String),
  transformPath: Schema.optional(
    functionSchema<PathTransform>(
      'PathTransformFunction',
      'A function that rewrites an operation path',
    ),
  ),
  operationExtensions: Schema.optional(
    functionSchema<OperationExtensionsHook>(
      'OperationExtensionsFunction',
      'A function that returns the extensions to add to an operation',
    ),
  ),
  extractValidation: Schema.optional(Schema.Boolean),
  excludeDecorators: Schema.optional(Schema.Array(Schema.String)),
  decorators: Schema.optional(
    Schema.Record({ key: Schema.String, value: DecoratorMappingConfig }),
  ),
  include: Schema.optional(Schema.Array(Schema.String)),
  deepScanRoutes: Schema.optional(Schema.Boolean),
  enums: Schema.optional(Schema.Literal('nest', 'ref')),
  versioning: Schema.optional(
    Schema.Struct({
      type: Schema.Literal('uri', 'header', 'media-type', 'custom'),
      prefix: Schema.optional(
        Schema.Union(Schema.String, Schema.Literal(false)),
      ),
      defaultVersion: Schema.optional(
        Schema.Union(
          Schema.String,
          Schema.SymbolFromSelf,
          Schema.Array(Schema.Union(Schema.String, Schema.SymbolFromSelf)),
        ),
      ),
    }),
  ),
  schemaNameCollision: Schema.optional(
    Schema.Union(
      Schema.Literal('inline', 'rename', 'error'),
      functionSchema<(collision: SchemaNameCollision) => string>(
        'SchemaNameCollisionFunction',
        'A function that returns the component name for a colliding declaration',
      ),
    ),
  ),
  overlay: Schema.optional(
    Schema.Union(
      Schema.String,
      Schema.Record({ key: Schema.String, value: Schema.Unknown }),
    ),
  ),
  overlayUnmatchedTarget: Schema.optional(Schema.Literal('error', 'warn')),
  query: Schema.optional(QueryOptionsConfig),
  schemas: Schema.optional(SchemaOptionsConfig),
  pathFilter: Schema.optional(PathFilter),
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
  aliasRefs: Schema.Literal('collapse', 'preserve'),
  basePath: Schema.optional(Schema.String),
  pathFilter: Schema.optional(PathFilter),
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
