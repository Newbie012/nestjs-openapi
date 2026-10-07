import type { OpenApiPaths, OpenApiSchema } from '../config/types.js';

const REF_PREFIX = '#/components/schemas/';

const VALID_COMPONENT_NAME = /^[a-zA-Z0-9._-]+$/;

// Page<User> → Page_User, Page<User[]> → Page_UserArray,
// Result<A | B, C> → Result_A_Or_B_C
export const sanitizeComponentName = (name: string) => {
  if (VALID_COMPONENT_NAME.test(name)) return name;
  return name
    .replace(/\[\]/g, 'Array')
    .replace(/\s*\|\s*/g, '_Or_')
    .replace(/\s*&\s*/g, '_And_')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
};

const mapDeep = (
  value: unknown,
  map: (record: Record<string, unknown>) => Record<string, unknown>,
): unknown => {
  if (Array.isArray(value)) return value.map((item) => mapDeep(item, map));
  if (!value || typeof value !== 'object') return value;
  const mapped = map(value as Record<string, unknown>);
  return Object.fromEntries(
    Object.entries(mapped).map(([key, item]) => [key, mapDeep(item, map)]),
  );
};

export const sanitizeComponentNames = (
  paths: OpenApiPaths,
  schemas: Record<string, OpenApiSchema>,
) => {
  const taken = new Set(
    Object.keys(schemas).filter((name) => VALID_COMPONENT_NAME.test(name)),
  );
  const renames = new Map<string, string>();
  for (const name of Object.keys(schemas).sort()) {
    if (VALID_COMPONENT_NAME.test(name)) continue;
    const base = sanitizeComponentName(name) || 'Schema';
    let candidate = base;
    for (let index = 2; taken.has(candidate); index++) {
      candidate = `${base}_${index}`;
    }
    taken.add(candidate);
    renames.set(name, candidate);
  }
  if (renames.size === 0) return { paths, schemas };

  const renameRef = (ref: string) => {
    if (!ref.startsWith(REF_PREFIX)) return ref;
    const name = ref.slice(REF_PREFIX.length);
    return `${REF_PREFIX}${renames.get(name) ?? name}`;
  };
  const rewrite = (record: Record<string, unknown>) => {
    let result = record;
    if (typeof record['$ref'] === 'string') {
      result = { ...result, $ref: renameRef(record['$ref']) };
    }
    const discriminator = record['discriminator'] as
      | { mapping?: Record<string, string> }
      | undefined;
    if (discriminator?.mapping) {
      result = {
        ...result,
        discriminator: {
          ...discriminator,
          mapping: Object.fromEntries(
            Object.entries(discriminator.mapping).map(([key, ref]) => [
              key,
              renameRef(ref),
            ]),
          ),
        },
      };
    }
    return result;
  };

  return {
    paths: mapDeep(paths, rewrite) as OpenApiPaths,
    schemas: Object.fromEntries(
      Object.entries(schemas).map(([name, schema]) => [
        renames.get(name) ?? name,
        mapDeep(schema, rewrite) as OpenApiSchema,
      ]),
    ),
  };
};

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
