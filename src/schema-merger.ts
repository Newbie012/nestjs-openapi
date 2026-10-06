/**
 * Schema Merger - Combines DTO schemas with path-referenced schemas
 *
 * This module merges generated DTO schemas into the final OpenAPI specification,
 * ensuring all referenced schemas are included in components/schemas.
 */

import type { GeneratedSchemas, JsonSchema } from './schema-generator.js';
import type { OpenApiPaths, OpenApiSchema } from './types.js';
import { Effect } from 'effect';

/**
 * Result of schema merging
 */
export interface MergedResult {
  /** The paths with updated $ref values */
  readonly paths: OpenApiPaths;
  /** All schemas to include in components/schemas */
  readonly schemas: Record<string, OpenApiSchema>;
}

/**
 * Extract all schema names referenced in paths
 */
const extractReferencedSchemas = (paths: OpenApiPaths): Set<string> => {
  const refs = new Set<string>();

  const extractFromSchema = (schema: OpenApiSchema | undefined): void => {
    if (!schema) return;

    if (schema.$ref) {
      const match = schema.$ref.match(/^#\/components\/schemas\/(.+)$/);
      if (match) {
        refs.add(match[1]);
      }
    }

    if (schema.items) {
      extractFromSchema(schema.items);
    }

    if (schema.oneOf) {
      schema.oneOf.forEach(extractFromSchema);
    }

    if (schema.allOf) {
      schema.allOf.forEach(extractFromSchema);
    }

    if (schema.anyOf) {
      schema.anyOf.forEach(extractFromSchema);
    }

    if (schema.properties) {
      Object.values(schema.properties).forEach(extractFromSchema);
    }
  };

  for (const pathMethods of Object.values(paths)) {
    for (const operation of Object.values(pathMethods)) {
      // Extract from parameters
      operation.parameters?.forEach((param) => {
        extractFromSchema(param.schema);
      });

      // Extract from request body
      if (operation.requestBody?.content) {
        Object.values(operation.requestBody.content).forEach((content) => {
          extractFromSchema(content.schema);
        });
      }

      // Extract from responses
      Object.values(operation.responses).forEach((response) => {
        if (response.content) {
          Object.values(response.content).forEach((content) => {
            extractFromSchema(content.schema);
          });
        }
      });
    }
  }

  return refs;
};

/**
 * Extract schemas referenced within schema definitions (for nested types)
 */
const extractNestedReferences = (
  schemas: Record<string, JsonSchema>,
  knownSchemas: Set<string>,
): Set<string> => {
  const refs = new Set<string>();

  const extractFromSchema = (schema: JsonSchema | undefined): void => {
    if (!schema) return;

    if (schema.$ref) {
      const match = schema.$ref.match(
        /^#\/(?:components\/schemas|definitions)\/(.+)$/,
      );
      if (match && !knownSchemas.has(match[1])) {
        refs.add(match[1]);
      }
    }

    if (schema.items) {
      extractFromSchema(schema.items);
    }

    if (schema.oneOf) {
      schema.oneOf.forEach(extractFromSchema);
    }

    if (schema.anyOf) {
      schema.anyOf.forEach(extractFromSchema);
    }

    if (schema.allOf) {
      schema.allOf.forEach(extractFromSchema);
    }

    if (schema.properties) {
      Object.values(schema.properties).forEach(extractFromSchema);
    }

    if (
      schema.additionalProperties &&
      typeof schema.additionalProperties === 'object'
    ) {
      extractFromSchema(schema.additionalProperties);
    }
  };

  for (const schema of Object.values(schemas)) {
    extractFromSchema(schema);
  }

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

// OpenAPI 3.0 ignores keywords beside `$ref`, so a reference with a
// description, nullability... is wrapped as `{ allOf: [{ $ref }], ...}`, as
// @nestjs/swagger emits it
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

// The generator emits `T | null` as `anyOf: [T, { type: 'null' }]`, and
// OpenAPI 3.0 has no null type
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

  // Build result object incrementally
  const result: Record<string, unknown> = {};

  // Normalize 3.1 type arrays to 3.0 nullable (e.g., ["string", "null"] → { type: "string", nullable: true })
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
  // Const value for discriminated unions
  if (schema.const !== undefined) result['const'] = schema.const;

  // Validation constraints - string
  if (schema.minLength !== undefined) result['minLength'] = schema.minLength;
  if (schema.maxLength !== undefined) result['maxLength'] = schema.maxLength;
  if (schema.pattern !== undefined) result['pattern'] = schema.pattern;

  // Validation constraints - number
  if (schema.minimum !== undefined) result['minimum'] = schema.minimum;
  if (schema.maximum !== undefined) result['maximum'] = schema.maximum;
  if (schema.exclusiveMinimum !== undefined)
    result['exclusiveMinimum'] = schema.exclusiveMinimum;
  if (schema.exclusiveMaximum !== undefined)
    result['exclusiveMaximum'] = schema.exclusiveMaximum;
  if (schema.multipleOf !== undefined) result['multipleOf'] = schema.multipleOf;

  // Validation constraints - array
  if (schema.minItems !== undefined) result['minItems'] = schema.minItems;
  if (schema.maxItems !== undefined) result['maxItems'] = schema.maxItems;
  if (schema.uniqueItems !== undefined)
    result['uniqueItems'] = schema.uniqueItems;

  // Default value
  if (schema.default !== undefined) result['default'] = schema.default;

  // Schema metadata (from @ApiProperty)
  if (schema.title) result['title'] = schema.title;
  if (schema.example !== undefined) result['example'] = schema.example;
  if (schema.deprecated === true) result['deprecated'] = true;
  if (schema.readOnly === true) result['readOnly'] = true;
  if (schema.writeOnly === true) result['writeOnly'] = true;
  // Explicit nullable from @ApiProperty (not from type-array normalization above)
  if (schema.nullable === true && !result['nullable'])
    result['nullable'] = true;

  if (schema.items) {
    result['items'] = convertToOpenApiSchema(schema.items);
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
    // Add additionalProperties: false for object schemas with properties
    // unless explicitly set otherwise
    if (schema.additionalProperties === undefined) {
      result['additionalProperties'] = false;
    }
  }

  // Handle explicit additionalProperties setting
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
 * Merge generated DTO schemas with paths
 *
 * This function:
 * 1. Extracts all schema references from paths
 * 2. Includes only the schemas that are actually referenced
 * 3. Recursively includes nested schema references
 */
const mergeSchemasInternal = (
  paths: OpenApiPaths,
  generatedSchemas: GeneratedSchemas,
  extraRoots: readonly string[] = [],
): MergedResult => {
  // Find all schemas referenced in paths, plus @ApiExtraModels
  const referencedSchemas = new Set([
    ...extractReferencedSchemas(paths),
    ...extraRoots,
  ]);

  // Build the schema collection, starting with referenced schemas
  const schemas: Record<string, OpenApiSchema> = {};
  const processedSchemas = new Set<string>();
  const toProcess = [...referencedSchemas];

  while (toProcess.length > 0) {
    const schemaName = toProcess.pop()!;

    if (processedSchemas.has(schemaName)) {
      continue;
    }

    processedSchemas.add(schemaName);

    const jsonSchema = generatedSchemas.definitions[schemaName];
    if (jsonSchema) {
      schemas[schemaName] = convertToOpenApiSchema(jsonSchema);

      // Find nested references
      const nestedRefs = extractNestedReferences(
        { [schemaName]: jsonSchema },
        processedSchemas,
      );

      for (const ref of nestedRefs) {
        if (!processedSchemas.has(ref)) {
          toProcess.push(ref);
        }
      }
    }
  }

  return { paths, schemas };
};

export const mergeSchemas = (
  paths: OpenApiPaths,
  generatedSchemas: GeneratedSchemas,
  extraRoots?: readonly string[],
): MergedResult => mergeSchemasInternal(paths, generatedSchemas, extraRoots);

export const mergeSchemasEffect = Effect.fn('SchemaMerger.mergeSchemas')(
  function* (
    paths: OpenApiPaths,
    generatedSchemas: GeneratedSchemas,
    extraRoots?: readonly string[],
  ) {
    return yield* Effect.succeed(
      mergeSchemasInternal(paths, generatedSchemas, extraRoots),
    );
  },
);

/**
 * Merge multiple GeneratedSchemas objects into one
 */
const mergeGeneratedSchemasInternal = (
  ...schemas: GeneratedSchemas[]
): GeneratedSchemas => {
  const definitions: Record<string, JsonSchema> = {};

  for (const schema of schemas) {
    Object.assign(definitions, schema.definitions);
  }

  return { definitions };
};

export const mergeGeneratedSchemas = (
  ...schemas: GeneratedSchemas[]
): GeneratedSchemas => mergeGeneratedSchemasInternal(...schemas);

export const mergeGeneratedSchemasEffect = Effect.fn(
  'SchemaMerger.mergeGeneratedSchemas',
)(function* (...schemas: GeneratedSchemas[]) {
  return yield* Effect.succeed(mergeGeneratedSchemasInternal(...schemas));
});

/**
 * Filter schemas to only include those matching certain patterns
 */
const filterSchemasInternal = (
  schemas: GeneratedSchemas,
  include?: readonly string[],
  exclude?: readonly string[],
): GeneratedSchemas => {
  const definitions: Record<string, JsonSchema> = {};

  for (const [name, schema] of Object.entries(schemas.definitions)) {
    // Check include patterns
    if (include && include.length > 0) {
      const matches = include.some((pattern) => {
        if (pattern.includes('*')) {
          const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
          return regex.test(name);
        }
        return name === pattern;
      });
      if (!matches) continue;
    }

    // Check exclude patterns
    if (exclude && exclude.length > 0) {
      const excluded = exclude.some((pattern) => {
        if (pattern.includes('*')) {
          const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
          return regex.test(name);
        }
        return name === pattern;
      });
      if (excluded) continue;
    }

    definitions[name] = schema;
  }

  return { definitions };
};

export const filterSchemas = (
  schemas: GeneratedSchemas,
  include?: readonly string[],
  exclude?: readonly string[],
): GeneratedSchemas => filterSchemasInternal(schemas, include, exclude);

export const filterSchemasEffect = Effect.fn('SchemaMerger.filterSchemas')(
  function* (
    schemas: GeneratedSchemas,
    include?: readonly string[],
    exclude?: readonly string[],
  ) {
    return yield* Effect.succeed(
      filterSchemasInternal(schemas, include, exclude),
    );
  },
);
