import type {
  OpenApiOperation,
  OpenApiPaths,
  OpenApiSchema,
  OpenApiSpec,
  OpenApiVersion,
} from './types.js';

/**
 * Transforms schemas between OpenAPI 3.0 and 3.1/3.2 formats
 *
 * Key differences:
 * - 3.0: { type: 'string', nullable: true }
 * - 3.1: { type: ['string', 'null'] }
 *
 * - 3.0: { example: 'value' }
 * - 3.1: { examples: ['value'] }
 */

/**
 * Recursively transforms a schema from 3.0 to 3.1 format
 */
const transformSchemaToV31 = (schema: OpenApiSchema): OpenApiSchema => {
  // Transform nested schemas first
  const transformedOneOf = schema.oneOf?.map(transformSchemaToV31);
  const transformedAnyOf = schema.anyOf?.map(transformSchemaToV31);
  const transformedAllOf = schema.allOf?.map(transformSchemaToV31);
  const transformedItems = schema.items
    ? transformSchemaToV31(schema.items)
    : undefined;
  const transformedProperties = schema.properties
    ? Object.fromEntries(
        Object.entries(schema.properties).map(([key, value]) => [
          key,
          transformSchemaToV31(value),
        ]),
      )
    : undefined;

  // Handle nullable: transform to type array
  const hasNullable =
    schema.nullable && schema.type && typeof schema.type === 'string';
  const transformedType = hasNullable
    ? ([schema.type, 'null'] as const)
    : schema.type;

  // Build new schema object without the nullable field if we transformed it
  const { nullable: _nullable, ...restWithoutNullable } = schema;

  return {
    ...restWithoutNullable,
    type: transformedType,
    ...(transformedOneOf && { oneOf: transformedOneOf }),
    ...(transformedAnyOf && { anyOf: transformedAnyOf }),
    ...(transformedAllOf && { allOf: transformedAllOf }),
    ...(transformedItems && { items: transformedItems }),
    ...(transformedProperties && { properties: transformedProperties }),
  };
};

/**
 * Transforms all schemas in a spec to match the target OpenAPI version
 */
export const transformSchemasForVersion = (
  schemas: Record<string, OpenApiSchema>,
  version: OpenApiVersion,
): Record<string, OpenApiSchema> => {
  if (version === '3.0.3') {
    // No transformation needed for 3.0
    return schemas;
  }

  // For 3.1.0 and 3.2.0, convert nullable to type arrays
  return Object.fromEntries(
    Object.entries(schemas).map(([key, schema]) => [
      key,
      transformSchemaToV31(schema),
    ]),
  );
};

/**
 * Transforms an operation's schemas (parameters, requestBody, responses)
 */
const transformOperationToV31 = (
  operation: OpenApiOperation,
): OpenApiOperation => {
  const parameters = operation.parameters?.map((param) => ({
    ...param,
    schema: transformSchemaToV31(param.schema),
  }));

  const requestBody = operation.requestBody
    ? {
        ...operation.requestBody,
        content: Object.fromEntries(
          Object.entries(operation.requestBody.content).map(
            ([contentType, mediaType]) => [
              contentType,
              { ...mediaType, schema: transformSchemaToV31(mediaType.schema) },
            ],
          ),
        ),
      }
    : undefined;

  const responses = Object.fromEntries(
    Object.entries(operation.responses).map(([code, response]) => [
      code,
      response.content
        ? {
            ...response,
            content: Object.fromEntries(
              Object.entries(response.content).map(
                ([contentType, mediaType]) => [
                  contentType,
                  {
                    ...mediaType,
                    schema: transformSchemaToV31(mediaType.schema),
                  },
                ],
              ),
            ),
          }
        : response,
    ]),
  );

  return {
    ...operation,
    ...(parameters && { parameters }),
    ...(requestBody && { requestBody }),
    responses,
  };
};

const HTTP_METHODS = new Set([
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
]);

/**
 * Transforms all path operations to match the target version.
 * Only transforms HTTP method entries, leaving path-level fields
 * (parameters, summary, description) untouched.
 */
const transformPathsForVersion = (
  paths: OpenApiPaths,
  version: OpenApiVersion,
): OpenApiPaths => {
  if (version === '3.0.3') return paths;

  return Object.fromEntries(
    Object.entries(paths).map(([path, pathItem]) => [
      path,
      Object.fromEntries(
        Object.entries(pathItem).map(([key, value]) =>
          HTTP_METHODS.has(key)
            ? [key, transformOperationToV31(value)]
            : [key, value],
        ),
      ),
    ]),
  );
};

/**
 * Transforms the entire spec to match the target OpenAPI version
 * Handles:
 * - Schema transformations (nullable, type arrays)
 * - Path-level schema transformations
 * - Version string in the openapi field
 */
export const transformSpecForVersion = (
  spec: OpenApiSpec,
  version: OpenApiVersion,
): OpenApiSpec => {
  if (version === '3.0.3') {
    return { ...spec, openapi: version };
  }

  // Transform component schemas
  const transformedSchemas = spec.components?.schemas
    ? transformSchemasForVersion(spec.components.schemas, version)
    : undefined;

  // Transform path-level schemas
  const transformedPaths = transformPathsForVersion(spec.paths, version);

  return {
    ...spec,
    openapi: version,
    paths: transformedPaths,
    ...(transformedSchemas && {
      components: {
        ...spec.components,
        schemas: transformedSchemas,
      },
    }),
  };
};
