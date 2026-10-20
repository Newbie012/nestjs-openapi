import type { OpenApiPaths, OpenApiSchema } from '../config/types.js';
import {
  SCHEMA_REF_PREFIX,
  mapOperationSchemas,
  mapSubschemas,
} from './schema-walk.js';

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

// Points every `$ref` and discriminator mapping at the renamed component
export const renameSchemaRefs = (
  value: unknown,
  renames: ReadonlyMap<string, string>,
): unknown => {
  const renameRef = (ref: string) => {
    if (!ref.startsWith(SCHEMA_REF_PREFIX)) return ref;
    const name = ref.slice(SCHEMA_REF_PREFIX.length);
    return `${SCHEMA_REF_PREFIX}${renames.get(name) ?? name}`;
  };
  return mapDeep(value, (record) => {
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
  });
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

  const rewrite = (value: unknown) => renameSchemaRefs(value, renames);

  return {
    paths: rewrite(paths) as OpenApiPaths,
    schemas: Object.fromEntries(
      Object.entries(schemas).map(([name, schema]) => [
        renames.get(name) ?? name,
        rewrite(schema) as OpenApiSchema,
      ]),
    ),
  };
};

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
  const mapped = mapSubschemas(schema, (sub) =>
    adaptSchemaExamples(sub, version),
  );
  if (!mapped || typeof mapped !== 'object' || Array.isArray(mapped))
    return mapped;

  const result = mapped as Record<string, unknown>;
  const examples = result['examples'];
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
) => ({
  paths: mapOperationSchemas(paths, (schema) =>
    adaptSchemaExamples(schema, version),
  ),
  schemas: Object.fromEntries(
    Object.entries(schemas).map(([name, schema]) => [
      name,
      adaptSchemaExamples(schema, version) as OpenApiSchema,
    ]),
  ),
});
