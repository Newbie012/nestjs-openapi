import { Effect, Option } from 'effect';
import type {
  MethodInfo,
  MethodSecurityRequirement,
  OpenApiOperation,
  OpenApiParameter,
  OpenApiPaths,
  OpenApiSchema,
  ParameterConstraints,
  ResolvedParameter,
  ResponseMetadata,
} from './domain.js';
import type { SecurityRequirement } from './types.js';

/**
 * Converts internal MethodSecurityRequirement[] to OpenAPI SecurityRequirement[] format.
 *
 * Internal format: [{ schemeName: 'bearer', scopes: [] }]
 * OpenAPI format: [{ 'bearer': [] }]
 *
 * Multiple requirements in the array = AND logic (all required).
 * Returns undefined if no security requirements.
 */
const buildSecurityRequirements = (
  requirements: readonly MethodSecurityRequirement[],
): readonly SecurityRequirement[] | undefined =>
  requirements.length === 0
    ? undefined
    : [
        Object.fromEntries(
          requirements.map((req) => [req.schemeName, [...req.scopes]]),
        ) as SecurityRequirement,
      ];

/** Gets request body content types from @ApiConsumes, defaults to 'application/json' */
const getRequestContentTypes = (methodInfo: MethodInfo): readonly string[] =>
  methodInfo.consumes.length > 0 ? methodInfo.consumes : ['application/json'];

/** Gets response content types from @ApiProduces, defaults to 'application/json' */
const getResponseContentTypes = (methodInfo: MethodInfo): readonly string[] =>
  methodInfo.produces.length > 0 ? methodInfo.produces : ['application/json'];

/** Builds content object with multiple content types */
const buildContentObject = (
  contentTypes: readonly string[],
  schema: OpenApiSchema,
): Record<string, { schema: OpenApiSchema }> =>
  Object.fromEntries(contentTypes.map((type) => [type, { schema }]));

type InlineObjectType = {
  readonly properties: Record<string, OpenApiSchema>;
  readonly required: readonly string[];
};

type InlineProperty = {
  readonly name: string;
  readonly type: string;
  readonly isOptional: boolean;
};

const INLINE_OBJECT_BOUNDARY_PATTERN = /^\s*\{[\s\S]*\}\s*$/;
const INLINE_OBJECT_SEPARATORS = new Set([';', ',']);
const BRACE_DEPTH_CHANGE: Record<string, number | undefined> = {
  '{': 1,
  '}': -1,
};

const pushInlinePart = (parts: string[], part: string): void => {
  const trimmed = part.trim();
  if (trimmed) {
    parts.push(trimmed);
  }
};

const splitInlineObjectParts = (content: string): readonly string[] => {
  const parts: string[] = [];
  let current = '';
  let braceDepth = 0;

  for (const char of content) {
    if (INLINE_OBJECT_SEPARATORS.has(char) && braceDepth === 0) {
      pushInlinePart(parts, current);
      current = '';
      continue;
    }

    current += char;
    braceDepth += BRACE_DEPTH_CHANGE[char] ?? 0;
  }

  pushInlinePart(parts, current);
  return parts;
};

const parseInlineProperty = (part: string): InlineProperty | undefined => {
  const colonIndex = part.indexOf(':');
  const rawName = colonIndex === -1 ? '' : part.slice(0, colonIndex).trim();
  const type = colonIndex === -1 ? '' : part.slice(colonIndex + 1).trim();
  const isOptional = rawName.endsWith('?');
  const name = (isOptional ? rawName.slice(0, -1) : rawName).trim();

  return name && type ? { name, type, isOptional } : undefined;
};

/**
 * Parse an inline object type string like "{ name: string; age?: number }"
 * Returns the properties and required fields, or null if not a valid inline type
 */
const parseInlineObjectType = (typeStr: string): InlineObjectType | null => {
  const trimmed = typeStr.trim();

  if (!INLINE_OBJECT_BOUNDARY_PATTERN.test(trimmed)) {
    return null;
  }

  const content = trimmed.slice(1, -1).trim();
  const properties = splitInlineObjectParts(content)
    .map(parseInlineProperty)
    .filter((property): property is InlineProperty => property !== undefined);

  return {
    properties: Object.fromEntries(
      properties.map((property) => [
        property.name,
        tsTypeToOpenApiSchema(property.type),
      ]),
    ),
    required: properties.flatMap((property) =>
      property.isOptional ? [] : [property.name],
    ),
  };
};

type TypeSchemaResolver = (tsType: string) => OpenApiSchema | undefined;

const OBJECT_SCHEMA: OpenApiSchema = { type: 'object' };

const PRIMITIVE_TYPE_SCHEMAS: Record<string, OpenApiSchema> = {
  string: { type: 'string' },
  number: { type: 'number' },
  boolean: { type: 'boolean' },
  date: { type: 'string', format: 'date-time' },
  void: OBJECT_SCHEMA,
  undefined: OBJECT_SCHEMA,
  never: OBJECT_SCHEMA,
  null: OBJECT_SCHEMA,
  unknown: OBJECT_SCHEMA,
  any: OBJECT_SCHEMA,
  object: OBJECT_SCHEMA,
};

const BINARY_TYPE_NAMES = new Set([
  'StreamableFile',
  'Buffer',
  'Readable',
  'ReadableStream',
]);

const RECORD_TYPE_PATTERN = /^Record<string,\s*(.+)>$/;
const TYPE_REFERENCE_PATTERN = /^[a-zA-Z_$][a-zA-Z0-9_$]*(<[^>]+>)?$/;

const buildInlineObjectSchema = (parsed: InlineObjectType): OpenApiSchema => ({
  type: 'object',
  properties: parsed.properties,
  ...(parsed.required.length > 0 ? { required: parsed.required } : {}),
});

const withNullable = (schema: OpenApiSchema): OpenApiSchema =>
  schema.$ref
    ? { allOf: [{ $ref: schema.$ref }], nullable: true }
    : { ...schema, nullable: true };

const resolveInlineObjectSchema: TypeSchemaResolver = (tsType) =>
  Option.fromNullable(parseInlineObjectType(tsType)).pipe(
    Option.map(buildInlineObjectSchema),
    Option.getOrUndefined,
  );

type UnionType = {
  readonly types: readonly string[];
  readonly hasNull: boolean;
};

const parseUnionType = (tsType: string): UnionType | undefined => {
  if (!tsType.includes(' | ')) {
    return undefined;
  }

  const members = tsType.split(' | ').map((member) => member.trim());
  return {
    hasNull: members.includes('null'),
    types: members.filter(
      (member) => member !== 'undefined' && member !== 'null',
    ),
  };
};

const buildUnionSchema = (types: readonly string[]): OpenApiSchema => {
  if (types.length === 0) {
    return { type: 'object' };
  }

  if (types.length === 1) {
    return tsTypeToOpenApiSchema(types[0]);
  }

  return { oneOf: types.map((type) => tsTypeToOpenApiSchema(type)) };
};

const resolveUnionSchema: TypeSchemaResolver = (tsType) =>
  Option.fromNullable(parseUnionType(tsType)).pipe(
    Option.map(({ types, hasNull }) => {
      const schema = buildUnionSchema(types);
      return hasNull && types.length > 0 ? withNullable(schema) : schema;
    }),
    Option.getOrUndefined,
  );

const resolvePrimitiveSchema: TypeSchemaResolver = (tsType) =>
  Option.fromNullable(PRIMITIVE_TYPE_SCHEMAS[tsType.toLowerCase()]).pipe(
    Option.map((schema) => ({ ...schema })),
    Option.getOrUndefined,
  );

const resolveBinarySchema: TypeSchemaResolver = (tsType) =>
  BINARY_TYPE_NAMES.has(tsType)
    ? { type: 'string', format: 'binary' }
    : undefined;

const resolveArraySchema: TypeSchemaResolver = (tsType) =>
  tsType.endsWith('[]')
    ? {
        type: 'array',
        items: tsTypeToOpenApiSchema(tsType.slice(0, -2)),
      }
    : undefined;

const resolveRecordSchema: TypeSchemaResolver = (tsType) =>
  RECORD_TYPE_PATTERN.test(tsType) ? { type: 'object' } : undefined;

const resolveReferenceSchema: TypeSchemaResolver = (tsType) =>
  TYPE_REFERENCE_PATTERN.test(tsType)
    ? { $ref: `#/components/schemas/${tsType}` }
    : undefined;

const TYPE_SCHEMA_RESOLVERS: readonly TypeSchemaResolver[] = [
  resolveInlineObjectSchema,
  resolveUnionSchema,
  resolvePrimitiveSchema,
  resolveBinarySchema,
  resolveArraySchema,
  resolveRecordSchema,
  resolveReferenceSchema,
];

const tsTypeToOpenApiSchema = (tsType: string): OpenApiSchema => {
  const trimmed = tsType.trim();
  for (const resolver of TYPE_SCHEMA_RESOLVERS) {
    const schema = resolver(trimmed);
    if (schema !== undefined) {
      return schema;
    }
  }
  return { type: 'object' };
};

const isNodeModulesPath = (filePath: string): boolean =>
  filePath.includes('/node_modules/') || filePath.includes('\\node_modules\\');

const shouldFallbackExternalReturnRef = (
  returnType: MethodInfo['returnType'],
): boolean =>
  Option.isSome(returnType.filePath) &&
  isNodeModulesPath(returnType.filePath.value);

const responseSchemaOrObjectFallback = (
  schema: OpenApiSchema,
): OpenApiSchema => (schema.$ref ? { type: 'object' } : schema);

const PARAMETER_LOCATION_MAP: Record<
  ResolvedParameter['location'],
  OpenApiParameter['in']
> = {
  path: 'path',
  query: 'query',
  header: 'header',
  cookie: 'cookie',
  body: 'query',
};

const getParameterLocation = (
  location: ResolvedParameter['location'],
): OpenApiParameter['in'] => PARAMETER_LOCATION_MAP[location];

const applyParameterConstraints = (
  baseSchema: OpenApiSchema,
  constraints: ParameterConstraints,
): OpenApiSchema => {
  const {
    isArray,
    type: typeOverride,
    enum: enumValues,
    ...restConstraints
  } = constraints;
  const shouldApplyItemConstraints =
    (isArray === true || baseSchema.type === 'array') &&
    typeof typeOverride === 'string' &&
    typeOverride !== 'array';

  if (
    shouldApplyItemConstraints ||
    (baseSchema.type === 'array' && enumValues)
  ) {
    return {
      ...baseSchema,
      ...restConstraints,
      type: 'array',
      items: {
        ...(shouldApplyItemConstraints ? {} : baseSchema.items),
        ...(shouldApplyItemConstraints ? { type: typeOverride } : {}),
        ...(enumValues ? { enum: enumValues } : {}),
      },
    };
  }

  return {
    ...baseSchema,
    ...restConstraints,
    ...(typeOverride === undefined ? {} : { type: typeOverride }),
    ...(enumValues === undefined ? {} : { enum: enumValues }),
  };
};

const transformParameter = (param: ResolvedParameter): OpenApiParameter => {
  // Build base schema from TypeScript type
  const baseSchema = tsTypeToOpenApiSchema(param.tsType);

  // Merge validation constraints if present
  const schema = param.constraints
    ? applyParameterConstraints(baseSchema, param.constraints)
    : baseSchema;

  return {
    name: param.name,
    in: getParameterLocation(param.location),
    ...(Option.isSome(param.description)
      ? { description: param.description.value }
      : {}),
    required: param.location === 'path' ? true : param.required,
    schema,
  };
};

const isInlineOptionalBodyType = (tsType: string): boolean => {
  const parsed = parseInlineObjectType(tsType);
  return parsed !== null && parsed.required.length === 0;
};

const buildScalarReturnSchema = (
  returnType: MethodInfo['returnType'],
  shouldFallback: boolean,
): OpenApiSchema => {
  if (Option.isSome(returnType.type)) {
    const schema = tsTypeToOpenApiSchema(returnType.type.value);
    return shouldFallback ? responseSchemaOrObjectFallback(schema) : schema;
  }

  if (Option.isSome(returnType.inline)) {
    return tsTypeToOpenApiSchema(returnType.inline.value);
  }

  return { type: 'string' };
};

const buildArrayReturnSchema = (
  returnType: MethodInfo['returnType'],
): OpenApiSchema => ({
  type: 'array',
  items: Option.isSome(returnType.inline)
    ? tsTypeToOpenApiSchema(returnType.inline.value)
    : Option.match(returnType.type, {
        onNone: () => ({ type: 'object' }) as OpenApiSchema,
        onSome: (typeName) => tsTypeToOpenApiSchema(typeName),
      }),
});

const buildResponseSchema = (
  returnType: MethodInfo['returnType'],
): OpenApiSchema => {
  const shouldFallback =
    Option.isNone(returnType.container) &&
    shouldFallbackExternalReturnRef(returnType);

  return returnType.container.pipe(
    Option.match({
      onNone: () => buildScalarReturnSchema(returnType, shouldFallback),
      onSome: () => buildArrayReturnSchema(returnType),
    }),
  );
};

/** Builds schema from @ApiResponse type property */
const buildResponseSchemaFromMetadata = (
  response: ResponseMetadata,
): OpenApiSchema | undefined =>
  response.type.pipe(
    Option.map((typeName) => {
      const schema = tsTypeToOpenApiSchema(typeName);
      return response.isArray ? { type: 'array', items: schema } : schema;
    }),
    Option.getOrUndefined,
  );

/** Determines the default success status code based on HTTP method and @HttpCode */
const getDefaultSuccessCode = (methodInfo: MethodInfo): number =>
  Option.getOrElse(methodInfo.httpCode, () =>
    methodInfo.httpMethod === 'POST' ? 201 : 200,
  );

/** Check if return type is meaningful (not void, undefined, etc.) */
const hasMeaningfulReturnType = (
  returnType: MethodInfo['returnType'],
): boolean =>
  returnType.type.pipe(
    Option.match({
      onNone: () => Option.isSome(returnType.inline),
      onSome: (typeName) =>
        !['void', 'undefined', 'never'].includes(typeName.toLowerCase()),
    }),
  );

type ResponseObject = {
  description: string;
  content?: Record<string, { schema: OpenApiSchema }>;
};

/** Check if status code is a success code (2xx) but not 204 No Content */
const isSuccessWithContent = (statusCode: number): boolean =>
  statusCode >= 200 && statusCode < 300 && statusCode !== 204;

/** Build a single response entry */
const buildResponseEntry = (
  response: ResponseMetadata,
  returnType: MethodInfo['returnType'],
  hasReturnType: boolean,
  contentTypes: readonly string[],
): ResponseObject => {
  const schema =
    buildResponseSchemaFromMetadata(response) ??
    (hasReturnType && isSuccessWithContent(response.statusCode)
      ? buildResponseSchema(returnType)
      : undefined);

  const description = Option.getOrElse(response.description, () => '');

  return schema
    ? { description, content: buildContentObject(contentTypes, schema) }
    : { description };
};

const buildDefaultResponseEntry = (
  returnType: MethodInfo['returnType'],
  hasReturnType: boolean,
  contentTypes: readonly string[],
): ResponseObject => ({
  description: '',
  ...(hasReturnType
    ? {
        content: buildContentObject(
          contentTypes,
          buildResponseSchema(returnType),
        ),
      }
    : {}),
});

const hasDeclaredSuccessResponse = (
  responses: readonly ResponseMetadata[],
): boolean =>
  responses.some(
    (response) => response.statusCode >= 200 && response.statusCode < 300,
  );

const buildResponses = (
  methodInfo: MethodInfo,
): Record<string, ResponseObject> => {
  const contentTypes = getResponseContentTypes(methodInfo);
  const returnType = methodInfo.returnType;
  const hasReturnType = hasMeaningfulReturnType(returnType);
  const statusCode = getDefaultSuccessCode(methodInfo);
  const defaultSuccessEntry = buildDefaultResponseEntry(
    returnType,
    hasReturnType,
    contentTypes,
  );

  const declaredResponses = Object.fromEntries(
    methodInfo.responses.map((response) => [
      response.statusCode.toString(),
      buildResponseEntry(response, returnType, hasReturnType, contentTypes),
    ]),
  );

  return {
    ...(methodInfo.responses.length === 0 ||
    (!hasDeclaredSuccessResponse(methodInfo.responses) && hasReturnType)
      ? { [statusCode.toString()]: defaultSuccessEntry }
      : {}),
    ...declaredResponses,
  };
};

/** Transforms :param to {param} syntax */
const buildOpenApiPath = (path: string): string =>
  path.replace(/:([^/]+)/g, '{$1}') || '/';

const transformMethodInternal = (methodInfo: MethodInfo): OpenApiPaths => {
  const path = buildOpenApiPath(methodInfo.path);
  const method = methodInfo.httpMethod.toLowerCase();

  const bodyParams = methodInfo.parameters.filter((p) => p.location === 'body');
  const nonBodyParams = methodInfo.parameters.filter(
    (p) => p.location !== 'body',
  );

  const parameters = nonBodyParams.map(transformParameter);

  const requestContentTypes = getRequestContentTypes(methodInfo);
  const requestBody =
    bodyParams.length > 0
      ? {
          required:
            bodyParams[0].required &&
            !isInlineOptionalBodyType(bodyParams[0].tsType),
          content: buildContentObject(
            requestContentTypes,
            tsTypeToOpenApiSchema(bodyParams[0].tsType),
          ),
        }
      : undefined;

  // Use extracted operation metadata, falling back to generated defaults
  const operationId = Option.getOrElse(
    methodInfo.operation.operationId,
    () => `${methodInfo.controllerName}_${methodInfo.methodName}`,
  );

  // Only include summary if explicitly provided via @ApiOperation
  const summary = Option.getOrUndefined(methodInfo.operation.summary);
  const description = Option.getOrUndefined(methodInfo.operation.description);
  const deprecated = Option.getOrUndefined(methodInfo.operation.deprecated);

  // Build security requirements from decorators
  const security = buildSecurityRequirements(methodInfo.security);

  const operation: OpenApiOperation = {
    operationId,
    // Always include parameters array (even if empty) to match NestJS Swagger
    parameters,
    ...(requestBody ? { requestBody } : {}),
    responses: buildResponses(methodInfo),
    ...(summary !== undefined ? { summary } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(deprecated !== undefined ? { deprecated } : {}),
    tags:
      methodInfo.controllerTags.length > 0
        ? [...methodInfo.controllerTags]
        : undefined,
    ...(security !== undefined ? { security } : {}),
  };

  return {
    [path]: {
      [method]: operation,
    },
  };
};

export const transformMethod = (methodInfo: MethodInfo): OpenApiPaths =>
  transformMethodInternal(methodInfo);

type MutableOpenApiPaths = {
  [path: string]: {
    [method: string]: OpenApiOperation;
  };
};

const mergeOpenApiPaths = (endpoints: readonly OpenApiPaths[]): OpenApiPaths =>
  endpoints.reduce<MutableOpenApiPaths>((acc, endpoint) => {
    for (const path in endpoint) {
      acc[path] = { ...(acc[path] ?? {}), ...endpoint[path] };
    }
    return acc;
  }, {});

export const transformMethods = (
  methodInfos: readonly MethodInfo[],
): OpenApiPaths => mergeOpenApiPaths(methodInfos.map(transformMethodInternal));

const serviceTransformMethod = Effect.fn('TransformerService.transformMethod')(
  function* (methodInfo: MethodInfo) {
    const paths = yield* Effect.sync(() => transformMethodInternal(methodInfo));

    yield* Effect.annotateCurrentSpan(
      'controllerName',
      methodInfo.controllerName,
    );
    yield* Effect.annotateCurrentSpan('methodName', methodInfo.methodName);
    yield* Effect.annotateCurrentSpan('httpMethod', methodInfo.httpMethod);
    yield* Effect.annotateCurrentSpan('path', methodInfo.path);

    return paths;
  },
);

const serviceTransformMethods = Effect.fn(
  'TransformerService.transformMethods',
)(function* (methodInfos: readonly MethodInfo[]) {
  const endpoints = yield* Effect.forEach(methodInfos, serviceTransformMethod, {
    concurrency: 'unbounded',
  });
  const paths = mergeOpenApiPaths(endpoints);

  yield* Effect.annotateCurrentSpan('methodCount', methodInfos.length);
  yield* Effect.annotateCurrentSpan('pathCount', Object.keys(paths).length);

  return paths;
});

export class TransformerService extends Effect.Service<TransformerService>()(
  'TransformerService',
  {
    effect: Effect.succeed({
      transformMethod: serviceTransformMethod,
      transformMethods: serviceTransformMethods,
    }),
  },
) {}

export const transformMethodEffect = serviceTransformMethod;

export const transformMethodsEffect = serviceTransformMethods;
