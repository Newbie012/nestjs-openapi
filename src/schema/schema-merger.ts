/**
 * Schema Merger - Combines DTO schemas with path-referenced schemas
 *
 * This module merges generated DTO schemas into the final OpenAPI specification,
 * ensuring all referenced schemas are included in components/schemas.
 */

import type { GeneratedSchemas, JsonSchema } from './schema-generator.js';
import type { OpenApiPaths, OpenApiSchema } from '../config/types.js';
import {
  mapOperationSchemas,
  mapSchemaRefs,
  mapSubschemas,
} from './schema-walk.js';

/**
 * Result of schema merging
 */
export interface MergedResult {
  /** The paths with updated $ref values */
  readonly paths: OpenApiPaths;
  /** All schemas to include in components/schemas */
  readonly schemas: Record<string, OpenApiSchema>;
}

const refCollector = (
  pattern: RegExp,
  skip: (name: string) => boolean = () => false,
) => {
  const refs = new Set<string>();
  const collect = (ref: string): string => {
    const name = ref.match(pattern)?.[1];
    if (name !== undefined && !skip(name)) refs.add(name);
    return ref;
  };
  return { refs, collect };
};

/**
 * Extract all schema names referenced in paths
 */
const extractReferencedSchemas = (paths: OpenApiPaths): Set<string> => {
  const { refs, collect } = refCollector(/^#\/components\/schemas\/(.+)$/);
  mapOperationSchemas(paths, (schema) => mapSchemaRefs(schema, collect));
  return refs;
};

/**
 * Extract schemas referenced within schema definitions (for nested types)
 */
const extractNestedReferences = (
  schemas: Record<string, JsonSchema>,
  knownSchemas: Set<string>,
): Set<string> => {
  const { refs, collect } = refCollector(
    /^#\/(?:components\/schemas|definitions)\/(.+)$/,
    (name) => knownSchemas.has(name),
  );
  for (const schema of Object.values(schemas)) mapSchemaRefs(schema, collect);
  return refs;
};

const REF_SIBLING_KEYS = [
  'description',
  'title',
  'example',
  'default',
  'deprecated',
  'readOnly',
  'writeOnly',
  'nullable',
] as const;

const BOOLEAN_FLAG_KEYS = new Set([
  'deprecated',
  'readOnly',
  'writeOnly',
  'nullable',
]);

const convertRefSchema = (schema: JsonSchema, ref: string): OpenApiSchema => {
  const siblings = Object.fromEntries(
    REF_SIBLING_KEYS.flatMap((key) => {
      const value = schema[key];
      if (value === undefined) return [];
      if (BOOLEAN_FLAG_KEYS.has(key) && value !== true) return [];
      return [[key, value]];
    }),
  );
  const refSchema = {
    $ref: ref.replace('#/definitions/', '#/components/schemas/'),
  };
  if (Object.keys(siblings).length === 0) return refSchema;
  return { allOf: [refSchema], ...siblings } as OpenApiSchema;
};

const isNullSchema = (schema: JsonSchema) => schema.type === 'null';

const collapseNullVariants = (schema: JsonSchema): JsonSchema | undefined => {
  const key = schema.anyOf ? 'anyOf' : schema.oneOf ? 'oneOf' : undefined;
  const variants = key ? schema[key] : undefined;
  if (!key || !variants || !variants.some(isNullSchema)) return undefined;

  const nonNull = variants.filter((variant) => !isNullSchema(variant));
  const { [key]: _variants, ...outer } = schema;

  if (nonNull.length === 0) return { ...outer, nullable: true };
  if (nonNull.length === 1) {
    return { ...nonNull[0], ...outer, nullable: true } as JsonSchema;
  }
  return { ...outer, [key]: nonNull, nullable: true } as JsonSchema;
};

/**
 * Convert JsonSchema to OpenApiSchema format
 */
const convertToOpenApiSchema = (schema: JsonSchema): OpenApiSchema => {
  const withoutNullVariants = collapseNullVariants(schema);
  if (withoutNullVariants) return convertToOpenApiSchema(withoutNullVariants);

  const result: Record<string, unknown> = {};

  if (Array.isArray(schema.type)) {
    const nonNull = schema.type.filter((t) => t !== 'null');
    const isNullable = nonNull.length < schema.type.length;

    result['type'] = nonNull.length === 1 ? nonNull[0] : schema.type;
    if (isNullable && nonNull.length === 1) result['nullable'] = true;
  } else if (schema.type) {
    result['type'] = schema.type;
  }
  if (schema.format) result['format'] = schema.format;
  if (schema.$ref) {
    return convertRefSchema(schema, schema.$ref);
  }
  if (schema.description) result['description'] = schema.description;
  if (schema.enum) result['enum'] = schema.enum;
  if (schema.const !== undefined) result['const'] = schema.const;

  if (schema.minLength !== undefined) result['minLength'] = schema.minLength;
  if (schema.maxLength !== undefined) result['maxLength'] = schema.maxLength;
  if (schema.pattern !== undefined) result['pattern'] = schema.pattern;

  if (schema.minimum !== undefined) result['minimum'] = schema.minimum;
  if (schema.maximum !== undefined) result['maximum'] = schema.maximum;
  if (schema.exclusiveMinimum !== undefined)
    result['exclusiveMinimum'] = schema.exclusiveMinimum;
  if (schema.exclusiveMaximum !== undefined)
    result['exclusiveMaximum'] = schema.exclusiveMaximum;
  if (schema.multipleOf !== undefined) result['multipleOf'] = schema.multipleOf;

  if (schema.minItems !== undefined) result['minItems'] = schema.minItems;
  if (schema.maxItems !== undefined) result['maxItems'] = schema.maxItems;
  if (schema.uniqueItems !== undefined)
    result['uniqueItems'] = schema.uniqueItems;

  if (schema.default !== undefined) result['default'] = schema.default;

  if (schema.title) result['title'] = schema.title;
  if (schema.example !== undefined) result['example'] = schema.example;
  if (schema.deprecated === true) result['deprecated'] = true;
  if (schema.readOnly === true) result['readOnly'] = true;
  if (schema.writeOnly === true) result['writeOnly'] = true;
  if (schema.nullable === true && !result['nullable'])
    result['nullable'] = true;

  if (Array.isArray(schema.items)) {
    result['prefixItems'] = schema.items.map(convertToOpenApiSchema);
    result['items'] =
      typeof schema.additionalItems === 'object'
        ? convertToOpenApiSchema(schema.additionalItems)
        : false;
  } else if (schema.items) {
    result['items'] = convertToOpenApiSchema(schema.items as JsonSchema);
  }

  if (schema.oneOf) {
    result['oneOf'] = schema.oneOf.map(convertToOpenApiSchema);
  }

  if (schema.anyOf) {
    result['anyOf'] = schema.anyOf.map(convertToOpenApiSchema);
  }

  if (schema.allOf) {
    result['allOf'] = schema.allOf.map(convertToOpenApiSchema);
  }

  if (schema.properties) {
    result['properties'] = Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [
        key,
        convertToOpenApiSchema(value),
      ]),
    );
  }

  if (schema.additionalProperties !== undefined) {
    if (typeof schema.additionalProperties === 'boolean') {
      result['additionalProperties'] = schema.additionalProperties;
    } else {
      result['additionalProperties'] = convertToOpenApiSchema(
        schema.additionalProperties,
      );
    }
  }

  if (schema.required) {
    result['required'] = [...schema.required];
  }

  for (const key of PASSTHROUGH_KEYS) {
    if (schema[key] !== undefined)
      result[key] = convertRefsInValue(schema[key]);
  }
  if (schema.not && typeof schema.not === 'object') {
    result['not'] = convertToOpenApiSchema(schema.not as JsonSchema);
  }
  for (const [key, value] of Object.entries(schema)) {
    if (key.startsWith('x-')) result[key] = value;
  }

  return result as OpenApiSchema;
};

const PASSTHROUGH_KEYS = [
  'examples',
  'discriminator',
  'externalDocs',
  'xml',
  'minProperties',
  'maxProperties',
] as const;

const convertRefsInValue = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return value.replace(/^#\/definitions\//, '#/components/schemas/');
  }
  if (Array.isArray(value)) return value.map(convertRefsInValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        convertRefsInValue(item),
      ]),
    );
  }
  return value;
};

/**
 * The names `mergeSchemas` includes: the generated schemas that paths and
 * `extraRoots` reference, directly or through other schemas
 */
export const reachableSchemaNames = (
  paths: OpenApiPaths,
  generatedSchemas: GeneratedSchemas,
  extraRoots: readonly string[] = [],
): ReadonlySet<string> => {
  const reachable = new Set<string>();
  const processedSchemas = new Set<string>();
  const toProcess = [
    ...new Set([...extractReferencedSchemas(paths), ...extraRoots]),
  ];

  while (toProcess.length > 0) {
    const schemaName = toProcess.pop()!;
    if (processedSchemas.has(schemaName)) continue;
    processedSchemas.add(schemaName);

    const jsonSchema = generatedSchemas.definitions[schemaName];
    if (!jsonSchema) continue;
    reachable.add(schemaName);
    for (const ref of extractNestedReferences(
      { [schemaName]: jsonSchema },
      processedSchemas,
    )) {
      toProcess.push(ref);
    }
  }

  return reachable;
};

/**
 * Merge generated DTO schemas with paths: only the schemas the paths and
 * `extraRoots` reach are included, converted to OpenAPI form
 */
export const mergeSchemas = (
  paths: OpenApiPaths,
  generatedSchemas: GeneratedSchemas,
  extraRoots: readonly string[] = [],
): MergedResult => ({
  paths,
  schemas: Object.fromEntries(
    [...reachableSchemaNames(paths, generatedSchemas, extraRoots)].map(
      (name) => [
        name,
        convertToOpenApiSchema(generatedSchemas.definitions[name]!),
      ],
    ),
  ),
});

type SchemaNode = Record<string, unknown>;

const isSchemaNode = (value: unknown): value is SchemaNode =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const forbidInSchema = (value: unknown): unknown => {
  const mapped = mapSubschemas(value, forbidInSchema);
  if (!isSchemaNode(mapped) || !isSchemaNode(mapped['properties']))
    return mapped;
  return {
    ...mapped,
    additionalProperties: mapped['additionalProperties'] ?? false,
  };
};

/**
 * `options.schemas.additionalProperties: 'forbid'`: every object that lists
 * its properties allows no others, unless it declares otherwise
 */
export const forbidAdditionalProperties = (
  schemas: Record<string, OpenApiSchema>,
): Record<string, OpenApiSchema> =>
  Object.fromEntries(
    Object.entries(schemas).map(([name, schema]) => [
      name,
      forbidInSchema(schema) as OpenApiSchema,
    ]),
  );
