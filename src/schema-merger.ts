/**
 * Schema Merger - Combines DTO schemas with path-referenced schemas
 *
 * This module merges generated DTO schemas into the final OpenAPI specification,
 * ensuring all referenced schemas are included in components/schemas.
 */

import type { GeneratedSchemas, JsonSchema } from './schema-generator.js';
import type { OpenApiPaths, OpenApiSchema } from './types.js';

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

/**
 * Convert JsonSchema to OpenApiSchema format
 */
const convertToOpenApiSchema = (schema: JsonSchema): OpenApiSchema => {
  // Build result object incrementally
  const result: Record<string, unknown> = {};

  if (schema.type) result['type'] = schema.type;
  if (schema.format) result['format'] = schema.format;
  if (schema.$ref) {
    // Convert #/definitions/ to #/components/schemas/
    result['$ref'] = schema.$ref.replace(
      '#/definitions/',
      '#/components/schemas/',
    );
  }
  if (schema.description) result['description'] = schema.description;
  if (schema.enum) result['enum'] = schema.enum;

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

  // Validation constraints - array
  if (schema.minItems !== undefined) result['minItems'] = schema.minItems;
  if (schema.maxItems !== undefined) result['maxItems'] = schema.maxItems;

  // Default value
  if (schema.default !== undefined) result['default'] = schema.default;

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

  return result as OpenApiSchema;
};

/**
 * Merge generated DTO schemas with paths
 *
 * This function:
 * 1. Extracts all schema references from paths
 * 2. Includes only the schemas that are actually referenced
 * 3. Recursively includes nested schema references
 */
export const mergeSchemas = (
  paths: OpenApiPaths,
  generatedSchemas: GeneratedSchemas,
): MergedResult => {
  // Find all schemas referenced in paths
  const referencedSchemas = extractReferencedSchemas(paths);

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

/**
 * Merge multiple GeneratedSchemas objects into one
 */
export const mergeGeneratedSchemas = (
  ...schemas: GeneratedSchemas[]
): GeneratedSchemas => {
  const definitions: Record<string, JsonSchema> = {};

  for (const schema of schemas) {
    Object.assign(definitions, schema.definitions);
  }

  return { definitions };
};

/**
 * Filter schemas to only include those matching certain patterns
 */
export const filterSchemas = (
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
