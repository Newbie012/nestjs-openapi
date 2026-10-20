import type {
  OpenApiPaths,
  OpenApiSchema,
  OpenApiSpec,
  OpenApiVersion,
} from '../config/types.js';
import {
  SCHEMA_REF_PREFIX,
  mapOperationSchemas,
  mapSubschemas,
} from './schema-walk.js';

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
const NULL_SCHEMA: OpenApiSchema = { type: 'null' };

const schemaIncludesNull = (schema: OpenApiSchema): boolean => {
  if (schema.type === 'null') return true;
  return Array.isArray(schema.type) && schema.type.includes('null');
};

/**
 * Unwraps `{ allOf: [{ $ref }] }`, a wrapper that only exists because 3.0
 * ignores keywords sitting beside `$ref`. From 3.1 on, `$ref` takes siblings.
 */
const unwrapSingleRefAllOf = (schema: OpenApiSchema): OpenApiSchema => {
  const keys = Object.keys(schema);
  const onlyMember = schema.allOf?.length === 1 ? schema.allOf[0] : undefined;
  const isBareRef =
    onlyMember?.$ref !== undefined && Object.keys(onlyMember).length === 1;

  return keys.length === 1 && keys[0] === 'allOf' && isBareRef && onlyMember
    ? onlyMember
    : schema;
};

const getSingleRefAllOf = (schema: OpenApiSchema) => {
  const onlyMember = schema.allOf?.length === 1 ? schema.allOf[0] : undefined;
  if (onlyMember?.$ref === undefined || Object.keys(onlyMember).length !== 1) {
    return undefined;
  }
  return onlyMember.$ref;
};

// From 3.1 on, `$ref` takes sibling keywords, so the 3.0 wrapper
// `{ allOf: [{ $ref }], description }` becomes `{ $ref, description }`
const hoistSingleRefAllOf = (schema: OpenApiSchema): OpenApiSchema => {
  const ref = getSingleRefAllOf(schema);
  if (ref === undefined) return schema;
  const { allOf: _allOf, ...rest } = schema;
  return { $ref: ref, ...rest };
};

/**
 * JSON Schema 2020-12 dropped the `binary` and `byte` formats that 3.0 used to
 * mark payloads as bytes, so 3.1 states the same thing with content keywords.
 */
const BINARY_FORMAT_REPLACEMENTS: Record<string, OpenApiSchema> = {
  binary: { contentMediaType: 'application/octet-stream' },
  byte: { contentEncoding: 'base64' },
};

const replaceBinaryFormat = (schema: OpenApiSchema): OpenApiSchema => {
  const replacement = schema.format
    ? BINARY_FORMAT_REPLACEMENTS[schema.format]
    : undefined;
  if (!replacement) return schema;

  const { format: _format, ...rest } = schema;

  return { ...rest, ...replacement };
};

type Bound = 'Minimum' | 'Maximum';

const BOUNDS: readonly Bound[] = ['Minimum', 'Maximum'];

// The stricter of an inclusive and an exclusive bound
const exclusiveWins = (bound: Bound, inclusive: unknown, exclusive: number) =>
  typeof inclusive !== 'number' ||
  (bound === 'Minimum' ? exclusive >= inclusive : exclusive <= inclusive);

/**
 * 3.0 (JSON Schema draft 5) marks a bound exclusive with a boolean beside
 * `minimum`/`maximum`; 3.1 (2020-12) gives the exclusive bound as a number.
 * Either form can come from the source (`@IsPositive()` gives the number,
 * `@ApiProperty({ minimum, exclusiveMinimum: true })` the boolean).
 */
const exclusiveBoundsFor = <S extends Record<string, unknown>>(
  schema: S,
  version: 'v30' | 'v31',
): S => {
  let result: Record<string, unknown> = schema;
  for (const bound of BOUNDS) {
    const key = `exclusive${bound}`;
    const inclusiveKey = bound.toLowerCase();
    const exclusive = result[key];
    const inclusive = result[inclusiveKey];
    if (exclusive === undefined) continue;
    const { [key]: _exclusive, [inclusiveKey]: _inclusive, ...rest } = result;

    if (version === 'v30' && typeof exclusive === 'number') {
      result = exclusiveWins(bound, inclusive, exclusive)
        ? { ...rest, [inclusiveKey]: exclusive, [key]: true }
        : { ...rest, [inclusiveKey]: inclusive };
    } else if (version === 'v31' && typeof exclusive === 'boolean') {
      result =
        exclusive && typeof inclusive === 'number'
          ? { ...rest, [key]: inclusive }
          : {
              ...rest,
              ...(inclusive === undefined ? {} : { [inclusiveKey]: inclusive }),
            };
    }
  }
  return result as S;
};

/**
 * `nullable` adds null to the allowed types but leaves every other constraint
 * as it is, so an `enum` that does not list `null` still rejects it. A
 * nullable schema's `enum` therefore lists `null` too.
 */
const withNullInEnum = <S extends object>(schema: S): S => {
  const { enum: values, nullable } = schema as SchemaRecord;
  if (nullable !== true || !Array.isArray(values)) return schema;
  return values.includes(null)
    ? schema
    : { ...schema, enum: [...values, null] };
};

const transformSchemaToV31 = (input: OpenApiSchema): OpenApiSchema => {
  const schema = mapSubschemas(input, (sub) =>
    transformSchemaToV31(sub as OpenApiSchema),
  ) as OpenApiSchema;

  // Remove OpenAPI 3.0 nullable keyword and represent nullability in 3.1 schema form.
  const { nullable, ...restWithoutNullable } = withNullInEnum(schema);

  // Simple primitive nullable: { type: "string", nullable: true } -> { type: ["string", "null"] }
  const transformedType =
    nullable && typeof schema.type === 'string'
      ? ([schema.type, 'null'] as const)
      : schema.type;

  const transformedSchema: OpenApiSchema = {
    ...replaceBinaryFormat(exclusiveBoundsFor(restWithoutNullable, 'v31')),
    ...(transformedType !== undefined && { type: transformedType }),
  };

  if (!nullable) return hoistSingleRefAllOf(transformedSchema);

  // Nullability is already encoded in type array form.
  if (schema.type && typeof schema.type === 'string') {
    return transformedSchema;
  }

  // oneOf/anyOf can represent nullability directly by adding a null branch.
  if (transformedSchema.oneOf) {
    return {
      ...transformedSchema,
      oneOf: schemaIncludesNullInVariants(transformedSchema.oneOf)
        ? transformedSchema.oneOf
        : [...transformedSchema.oneOf, NULL_SCHEMA],
    };
  }

  if (transformedSchema.anyOf) {
    return {
      ...transformedSchema,
      anyOf: schemaIncludesNullInVariants(transformedSchema.anyOf)
        ? transformedSchema.anyOf
        : [...transformedSchema.anyOf, NULL_SCHEMA],
    };
  }

  // A wrapped reference keeps its metadata beside the null union:
  // { anyOf: [{ $ref }, { type: 'null' }], description }
  const ref = getSingleRefAllOf(transformedSchema);
  if (ref !== undefined) {
    const { allOf: _allOf, ...metadata } = transformedSchema;
    return { ...metadata, anyOf: [{ $ref: ref }, NULL_SCHEMA] };
  }

  // allOf/$ref/other schema forms need an outer union to keep nullability.
  return { anyOf: [unwrapSingleRefAllOf(transformedSchema), NULL_SCHEMA] };
};

const schemaIncludesNullInVariants = (
  variants: readonly OpenApiSchema[],
): boolean => variants.some(schemaIncludesNull);

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

// Bytes sent as the whole body are of the body's media type: a binary schema
// under `application/zip` is `contentMediaType: application/zip`. A JSON or
// wildcard key names no byte format, so it keeps application/octet-stream
const transformMediaSchemaToV31 = (
  schema: OpenApiSchema,
  contentType: string,
): OpenApiSchema => {
  const transformed = transformSchemaToV31(schema);
  return schema.format === 'binary' && !/\*|json/.test(contentType)
    ? { ...transformed, contentMediaType: contentType }
    : transformed;
};

/**
 * Transforms all path operations to match the target version.
 * Path-level fields (parameters, summary, description) stay untouched.
 */
const transformPathsForVersion = (
  paths: OpenApiPaths,
  version: OpenApiVersion,
): OpenApiPaths => {
  if (version === '3.0.3') return paths;

  return mapOperationSchemas(paths, (schema, contentType) =>
    contentType === undefined
      ? transformSchemaToV31(schema as OpenApiSchema)
      : transformMediaSchemaToV31(schema as OpenApiSchema, contentType),
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

type SchemaRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is SchemaRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const ANNOTATION_KEYS = new Set([
  'description',
  'title',
  'example',
  'default',
  'deprecated',
  'readOnly',
  'writeOnly',
  'externalDocs',
]);

// The single JSON type a schema allows, when it can be told
const inferSchemaType = (
  schema: unknown,
  components: Readonly<Record<string, unknown>>,
  seen: ReadonlySet<string> = new Set(),
): string | undefined => {
  if (!isRecord(schema)) return undefined;
  if (typeof schema['type'] === 'string') return schema['type'];

  const ref = schema['$ref'];
  if (typeof ref === 'string' && ref.startsWith(SCHEMA_REF_PREFIX)) {
    const name = ref.slice(SCHEMA_REF_PREFIX.length);
    if (seen.has(name)) return undefined;
    return inferSchemaType(
      components[name],
      components,
      new Set([...seen, name]),
    );
  }

  const values = Array.isArray(schema['enum'])
    ? schema['enum'].filter((value) => value !== null)
    : [];
  const valueTypes = new Set(values.map((value) => typeof value));
  if (values.length > 0 && valueTypes.size === 1) {
    const [valueType] = valueTypes;
    if (
      valueType === 'string' ||
      valueType === 'number' ||
      valueType === 'boolean'
    )
      return valueType;
  }

  if (
    isRecord(schema['properties']) ||
    schema['additionalProperties'] !== undefined
  )
    return 'object';
  if (schema['items'] !== undefined) return 'array';

  const member = (key: string) =>
    Array.isArray(schema[key])
      ? (schema[key] as unknown[]).map((item) =>
          inferSchemaType(item, components, seen),
        )
      : undefined;
  // allOf members all hold, so any one that knows its type gives it
  const allOf = member('allOf')?.find((type) => type !== undefined);
  if (allOf) return allOf;
  for (const key of ['oneOf', 'anyOf']) {
    const types = member(key);
    if (
      types &&
      types.length > 0 &&
      types.every((type) => type && type === types[0])
    )
      return types[0];
  }
  return undefined;
};

/**
 * OpenAPI 3.0.3: `nullable` only means something beside a `type` in the same
 * schema, and keywords beside `$ref` are ignored. A nullable reference
 * becomes `{ allOf: [{ $ref }], type, nullable: true }`; a nullable schema
 * whose type cannot be told allows null through an `anyOf` member instead.
 */
const typeNullable = (
  schema: SchemaRecord,
  components: Readonly<Record<string, unknown>>,
): SchemaRecord => {
  if (schema['nullable'] === undefined || schema['type'] !== undefined)
    return schema;
  const { nullable, $ref, ...rest } = schema;
  if (nullable !== true) return $ref === undefined ? rest : { $ref, ...rest };

  const withoutRef: SchemaRecord =
    $ref === undefined
      ? rest
      : { ...rest, allOf: [{ $ref }, ...((rest['allOf'] as unknown[]) ?? [])] };
  const type = inferSchemaType(schema, components);
  if (type) return { ...withoutRef, type, nullable: true };

  const annotations = Object.fromEntries(
    Object.entries(withoutRef).filter(([key]) => ANNOTATION_KEYS.has(key)),
  );
  const value = Object.fromEntries(
    Object.entries(withoutRef).filter(([key]) => !ANNOTATION_KEYS.has(key)),
  );
  return {
    ...annotations,
    anyOf: [value, { type: 'object', nullable: true, enum: [null] }],
  };
};

/**
 * `ts-json-schema-generator` emits `const` for any type with exactly one
 * inhabitant, and OpenAPI only adopted `const` in 3.1. For 3.0, in components
 * and inlined operation schemas alike, `enum: [value]` says the same thing.
 *
 * An existing `enum` wins: it already constrains the value, so `const` is
 * dropped rather than overwriting it.
 */
const constAsEnum = (schema: SchemaRecord): SchemaRecord => {
  if (!('const' in schema)) return schema;
  const { const: value, ...rest } = schema;
  return { ...rest, enum: (rest['enum'] as unknown[] | undefined) ?? [value] };
};

const NULL_MEMBER_V30: SchemaRecord = {
  type: 'object',
  nullable: true,
  enum: [null],
};

/**
 * 3.0 allows one string `type`, so a list such as `['string', 'number']`
 * becomes an `anyOf` of single-type members, with a null member when the list
 * had `'null'`. Keywords beside the list stay on the outer schema. One type
 * plus `'null'` becomes `{ type, nullable: true }`.
 */
const typeListAsAnyOf = (schema: SchemaRecord): SchemaRecord => {
  const { type, ...rest } = schema;
  if (!Array.isArray(type)) return schema;
  const types = type.filter((member): member is string => member !== 'null');
  const nullable = types.length < type.length || rest['nullable'] === true;
  const { nullable: _nullable, ...others } = rest;
  if (types.length === 1) {
    return { ...others, type: types[0], ...(nullable && { nullable: true }) };
  }
  if (types.length === 0)
    return nullable ? { ...others, ...NULL_MEMBER_V30 } : others;
  return {
    ...others,
    anyOf: [
      ...types.map((member) => ({ type: member })),
      ...(nullable ? [NULL_MEMBER_V30] : []),
    ],
  };
};

/**
 * 3.0 has no `prefixItems`: `items` is one schema for every element. A tuple
 * therefore loses which position holds which type; its positions become one
 * `items` schema, an `anyOf` of the distinct position types (and of the rest
 * element's type, when there is one). `minItems` and `maxItems` keep the
 * length.
 */
const tupleAsItems = (schema: SchemaRecord): SchemaRecord => {
  const { prefixItems, items, ...rest } = schema;
  if (!Array.isArray(prefixItems)) return schema;
  const members = [...prefixItems, ...(isRecord(items) ? [items] : [])];
  const distinct = members.filter(
    (member, index) =>
      members.findIndex(
        (other) => JSON.stringify(other) === JSON.stringify(member),
      ) === index,
  );
  if (distinct.length === 0) return rest;
  return {
    ...rest,
    items: distinct.length === 1 ? distinct[0] : { anyOf: distinct },
  };
};

const adaptSchemaForV30 = (
  value: unknown,
  components: Readonly<Record<string, unknown>>,
): unknown => {
  const mapped = mapSubschemas(value, (sub) =>
    adaptSchemaForV30(sub, components),
  );
  if (!isRecord(mapped)) return mapped;
  return typeNullable(
    exclusiveBoundsFor(
      typeListAsAnyOf(withNullInEnum(constAsEnum(tupleAsItems(mapped)))),
      'v30',
    ),
    components,
  );
};

// Every `schema` of an operation: parameters, request bodies, responses
const adaptOperationsForV30 = (
  value: unknown,
  components: Readonly<Record<string, unknown>>,
): unknown => {
  if (Array.isArray(value))
    return value.map((item) => adaptOperationsForV30(item, components));
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === 'schema'
        ? adaptSchemaForV30(item, components)
        : adaptOperationsForV30(item, components),
    ]),
  );
};

/**
 * Writes a 3.0 spec's schemas in the forms 3.0.3 gives meaning: nullable
 * beside a type, and exclusive bounds as booleans
 */
export const adaptSpecForV30 = (spec: OpenApiSpec): OpenApiSpec => {
  const components = (spec.components?.schemas ?? {}) as Record<
    string,
    unknown
  >;
  return {
    ...spec,
    paths: adaptOperationsForV30(spec.paths, components) as OpenApiPaths,
    ...(spec.components?.schemas && {
      components: {
        ...spec.components,
        schemas: Object.fromEntries(
          Object.entries(spec.components.schemas).map(([name, schema]) => [
            name,
            adaptSchemaForV30(schema, components) as OpenApiSchema,
          ]),
        ),
      },
    }),
  };
};
