import { Option } from 'effect';
import type {
  MethodInfo,
  MethodSecurityRequirement,
  OpenApiOperation,
  OpenApiParameter,
  OpenApiPaths,
  OpenApiSchema,
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
): readonly SecurityRequirement[] | undefined => {
  if (requirements.length === 0) return undefined;

  // Each MethodSecurityRequirement becomes an entry in a single SecurityRequirement object
  // This represents AND logic - all schemes are required together
  const combined: SecurityRequirement = {};
  for (const req of requirements) {
    combined[req.schemeName] = [...req.scopes];
  }

  return [combined];
};

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

/**
 * Parse an inline object type string like "{ name: string; age?: number }"
 * Returns the properties and required fields, or null if not a valid inline type
 */
const parseInlineObjectType = (
  typeStr: string,
): {
  properties: Record<string, OpenApiSchema>;
  required: string[];
} | null => {
  const trimmed = typeStr.trim();

  // Must start with { and end with }
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return null;
  }

  // Extract content between braces
  const content = trimmed.slice(1, -1).trim();

  if (!content) {
    // Empty object: {}
    return { properties: {}, required: [] };
  }

  const properties: Record<string, OpenApiSchema> = {};
  const required: string[] = [];

  // Split by ; or , handling nested braces
  const parts: string[] = [];
  let current = '';
  let braceDepth = 0;

  for (const char of content) {
    if (char === '{') {
      braceDepth++;
      current += char;
    } else if (char === '}') {
      braceDepth--;
      current += char;
    } else if ((char === ';' || char === ',') && braceDepth === 0) {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    parts.push(current.trim());
  }

  for (const part of parts) {
    // Parse "name: type" or "name?: type"
    const colonIndex = part.indexOf(':');
    if (colonIndex === -1) continue;

    let propName = part.slice(0, colonIndex).trim();
    const propType = part.slice(colonIndex + 1).trim();

    // Check for optional marker
    const isOptional = propName.endsWith('?');
    if (isOptional) {
      propName = propName.slice(0, -1).trim();
    }

    if (!propName || !propType) continue;

    // Recursively convert the property type
    properties[propName] = tsTypeToOpenApiSchema(propType);

    if (!isOptional) {
      required.push(propName);
    }
  }

  return { properties, required };
};

const tsTypeToOpenApiSchema = (tsType: string): OpenApiSchema => {
  const trimmed = tsType.trim();

  // Check for inline object type first
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const parsed = parseInlineObjectType(trimmed);
    if (parsed) {
      const schema: OpenApiSchema = {
        type: 'object',
        properties: parsed.properties,
      };
      if (parsed.required.length > 0) {
        return { ...schema, required: parsed.required };
      }
      return schema;
    }
  }

  if (trimmed.includes(' | ')) {
    const types = trimmed.split(' | ').map((t) => t.trim());
    return {
      oneOf: types.map((type) => tsTypeToOpenApiSchema(type)),
    };
  }

  switch (trimmed.toLowerCase()) {
    case 'string':
      return { type: 'string' };
    case 'number':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'date':
      return { type: 'string', format: 'date-time' };
    case 'void':
    case 'undefined':
    case 'never':
    case 'null':
      // These types indicate no content - return empty object as placeholder
      // The caller should handle this appropriately (e.g., no response body)
      return { type: 'object' };
    case 'unknown':
    case 'any':
      return { type: 'object' };
  }

  // Handle binary/stream response types - return binary format
  if (
    trimmed === 'StreamableFile' ||
    trimmed === 'Buffer' ||
    trimmed === 'Readable' ||
    trimmed === 'ReadableStream'
  ) {
    return { type: 'string', format: 'binary' };
  }

  if (trimmed.endsWith('[]')) {
    const itemType = trimmed.slice(0, -2);
    return {
      type: 'array',
      items: tsTypeToOpenApiSchema(itemType),
    };
  }

  // Handle Record<string, T> as object with additionalProperties
  const recordMatch = trimmed.match(/^Record<string,\s*(.+)>$/);
  if (recordMatch) {
    return {
      type: 'object',
    };
  }

  // PascalCase names (including generics like PaginatedResponse<T>) become $ref to components/schemas
  // Match: UserDto, PaginatedResponse<ArticleEntity>, ApiResponse<User,Error>
  if (trimmed.match(/^[A-Z][a-zA-Z0-9]*(<[^>]+>)?$/)) {
    return { $ref: `#/components/schemas/${trimmed}` };
  }

  return { type: 'object' };
};

const getParameterLocation = (
  location: ResolvedParameter['location'],
): OpenApiParameter['in'] => {
  switch (location) {
    case 'path':
      return 'path';
    case 'header':
      return 'header';
    case 'cookie':
      return 'cookie';
    default:
      return 'query';
  }
};

const transformParameter = (param: ResolvedParameter): OpenApiParameter => {
  // Build base schema from TypeScript type
  const baseSchema = tsTypeToOpenApiSchema(param.tsType);

  // Merge validation constraints if present
  const schema = param.constraints
    ? { ...baseSchema, ...param.constraints }
    : baseSchema;

  return {
    name: param.name,
    in: getParameterLocation(param.location),
    description: Option.getOrElse(
      param.description,
      () => `${param.location} parameter: ${param.name}`,
    ),
    required: param.location === 'path' ? true : param.required,
    schema,
  };
};

const buildResponseSchema = (
  returnType: MethodInfo['returnType'],
): OpenApiSchema => {
  if (
    Option.isSome(returnType.container) &&
    returnType.container.value === 'array'
  ) {
    // Handle array of inline type
    if (Option.isSome(returnType.inline)) {
      return {
        type: 'array',
        items: tsTypeToOpenApiSchema(returnType.inline.value),
      };
    }
    // Use tsTypeToOpenApiSchema to properly handle primitives, unions, etc.
    return {
      type: 'array',
      items: Option.isSome(returnType.type)
        ? tsTypeToOpenApiSchema(returnType.type.value)
        : { type: 'object' },
    };
  }

  // Use tsTypeToOpenApiSchema to properly handle primitives, unions, and refs
  if (Option.isSome(returnType.type)) {
    return tsTypeToOpenApiSchema(returnType.type.value);
  }

  // Handle inline object type - parse and extract properties
  if (Option.isSome(returnType.inline)) {
    return tsTypeToOpenApiSchema(returnType.inline.value);
  }

  return { type: 'string' };
};

/** Builds schema from @ApiResponse type property */
const buildResponseSchemaFromMetadata = (
  response: ResponseMetadata,
): OpenApiSchema | undefined => {
  if (Option.isNone(response.type)) return undefined;

  const typeName = response.type.value;

  if (response.isArray) {
    return {
      type: 'array',
      items: tsTypeToOpenApiSchema(typeName),
    };
  }

  // Use tsTypeToOpenApiSchema to properly handle primitives, unions, and refs
  return tsTypeToOpenApiSchema(typeName);
};

/** Determines the default success status code based on HTTP method and @HttpCode */
const getDefaultSuccessCode = (methodInfo: MethodInfo): number => {
  // Use @HttpCode if present
  if (Option.isSome(methodInfo.httpCode)) {
    return methodInfo.httpCode.value;
  }

  // Default: POST returns 201, others return 200
  return methodInfo.httpMethod === 'POST' ? 201 : 200;
};

/** Check if return type is meaningful (not void, undefined, etc.) */
const hasMeaningfulReturnType = (
  returnType: MethodInfo['returnType'],
): boolean => {
  if (Option.isSome(returnType.type)) {
    const typeName = returnType.type.value.toLowerCase();
    // Don't treat void, undefined, never as meaningful return types
    // any IS meaningful - it means "any JSON value" which maps to { type: 'object' }
    if (['void', 'undefined', 'never'].includes(typeName)) {
      return false;
    }
    return true;
  }
  return Option.isSome(returnType.inline);
};

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

  if (!schema) return { description };
  return { description, content: buildContentObject(contentTypes, schema) };
};

const buildResponses = (
  methodInfo: MethodInfo,
): Record<string, ResponseObject> => {
  const contentTypes = getResponseContentTypes(methodInfo);
  const returnType = methodInfo.returnType;
  const hasReturnType = hasMeaningfulReturnType(returnType);
  const statusCode = getDefaultSuccessCode(methodInfo);

  // No @ApiResponse decorators - use return type
  if (methodInfo.responses.length === 0) {
    if (!hasReturnType) {
      return { [statusCode.toString()]: { description: '' } };
    }
    return {
      [statusCode.toString()]: {
        description: '',
        content: buildContentObject(
          contentTypes,
          buildResponseSchema(returnType),
        ),
      },
    };
  }

  // Build responses from @ApiResponse decorators
  const result: Record<string, ResponseObject> = {};

  const hasSuccessResponse = methodInfo.responses.some(
    (r) => r.statusCode >= 200 && r.statusCode < 300,
  );

  // Add default success response if no 2xx response is declared
  if (!hasSuccessResponse && hasReturnType) {
    result[statusCode.toString()] = {
      description: '',
      content: buildContentObject(
        contentTypes,
        buildResponseSchema(returnType),
      ),
    };
  }

  for (const response of methodInfo.responses) {
    result[response.statusCode.toString()] = buildResponseEntry(
      response,
      returnType,
      hasReturnType,
      contentTypes,
    );
  }

  return result;
};

/** Transforms :param to {param} syntax */
const buildOpenApiPath = (path: string): string =>
  path.replace(/:([^/]+)/g, '{$1}') || '/';

export const transformMethod = (methodInfo: MethodInfo): OpenApiPaths => {
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
          description: `Request body parameter: ${bodyParams[0].name}`,
          required: bodyParams[0].required,
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

type MutableOpenApiPaths = {
  [path: string]: {
    [method: string]: OpenApiOperation;
  };
};

export const transformMethods = (
  methodInfos: readonly MethodInfo[],
): OpenApiPaths =>
  methodInfos.reduce<MutableOpenApiPaths>((acc, methodInfo) => {
    const endpoint = transformMethod(methodInfo);
    for (const path in endpoint) {
      if (!acc[path]) acc[path] = {};
      Object.assign(acc[path], endpoint[path]);
    }
    return acc;
  }, {});
