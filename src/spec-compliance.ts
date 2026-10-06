import type { OpenApiPaths, OpenApiSchema } from './types.js';

const SCHEMA_KEYS = new Set(['schema', 'items', 'not', 'additionalProperties']);
const SCHEMA_LIST_KEYS = new Set(['allOf', 'anyOf', 'oneOf']);

// OpenAPI 3.0 schemas only have `example` (the first value is used); 3.1
// (JSON Schema) wants an `examples` array, so a map of example objects
// becomes the list of their values
const exampleValues = (examples: unknown) => {
  if (Array.isArray(examples)) return examples;
  if (!examples || typeof examples !== 'object') return [examples];
  return Object.values(examples).map((example) =>
    example && typeof example === 'object' && 'value' in example
      ? (example as { value: unknown }).value
      : example,
  );
};

const adaptSchemaExamples = (schema: unknown, version: string): unknown => {
  if (Array.isArray(schema))
    return schema.map((item) => adaptSchemaExamples(item, version));
  if (!schema || typeof schema !== 'object') return schema;

  const record = schema as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === 'properties' && value && typeof value === 'object') {
      result[key] = Object.fromEntries(
        Object.entries(value).map(([name, item]) => [
          name,
          adaptSchemaExamples(item, version),
        ]),
      );
    } else if (SCHEMA_KEYS.has(key) || SCHEMA_LIST_KEYS.has(key)) {
      result[key] = adaptSchemaExamples(value, version);
    } else {
      result[key] = value;
    }
  }

  const examples = record['examples'];
  if (examples === undefined) return result;
  const values = exampleValues(examples);

  if (version.startsWith('3.0')) {
    const { examples: _examples, ...rest } = result;
    if (rest['example'] !== undefined || values.length === 0) return rest;
    return { ...rest, example: values[0] };
  }
  return { ...result, examples: values };
};

export const adaptExamplesForVersion = (
  paths: OpenApiPaths,
  schemas: Record<string, OpenApiSchema>,
  version: string,
) => {
  const adaptOperationSchemas = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(adaptOperationSchemas);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        key === 'schema'
          ? adaptSchemaExamples(item, version)
          : adaptOperationSchemas(item),
      ]),
    );
  };
  return {
    paths: adaptOperationSchemas(paths) as OpenApiPaths,
    schemas: Object.fromEntries(
      Object.entries(schemas).map(([name, schema]) => [
        name,
        adaptSchemaExamples(schema, version) as OpenApiSchema,
      ]),
    ),
  };
};
