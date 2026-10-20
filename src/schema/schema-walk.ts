type SchemaRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is SchemaRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `#/components/schemas/`, the prefix of every local schema reference */
export const SCHEMA_REF_PREFIX = '#/components/schemas/';

/** Path-item keys that hold one operation; 3.2 adds `query` */
export const OPERATION_KEYS: ReadonlySet<string> = new Set([
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
  'query',
]);

const SUBSCHEMA_KEYS = [
  'items',
  'additionalItems',
  'not',
  'additionalProperties',
] as const;
const SUBSCHEMA_LIST_KEYS = [
  'allOf',
  'anyOf',
  'oneOf',
  'prefixItems',
  'items',
] as const;
const SUBSCHEMA_MAP_KEYS = ['properties', 'patternProperties'] as const;

/**
 * A copy of `schema` with `f` applied to each direct subschema: `items`,
 * `additionalItems`, `not`, object `additionalProperties`, every
 * `allOf`/`anyOf`/`oneOf`/`prefixItems` member, every member of a draft-07
 * tuple's `items` list, and every value of `properties`/`patternProperties`.
 * Not recursive: `f` recurses by calling `mapSubschemas` itself. Anything that
 * is not a plain object is returned unchanged.
 */
export const mapSubschemas = (
  schema: unknown,
  f: (sub: unknown) => unknown,
): unknown => {
  if (!isRecord(schema)) return schema;
  const result: SchemaRecord = { ...schema };
  for (const key of SUBSCHEMA_KEYS) {
    if (isRecord(result[key])) result[key] = f(result[key]);
  }
  for (const key of SUBSCHEMA_LIST_KEYS) {
    const members = result[key];
    if (Array.isArray(members))
      result[key] = members.map((member) => f(member));
  }
  for (const key of SUBSCHEMA_MAP_KEYS) {
    const map = result[key];
    if (isRecord(map)) {
      result[key] = Object.fromEntries(
        Object.entries(map).map(([name, item]) => [name, f(item)]),
      );
    }
  }
  return result;
};

/**
 * A copy of `schema` with every `$ref`, at any depth, and every
 * `discriminator.mapping` value passed through `rewrite`
 */
export const mapSchemaRefs = (
  schema: unknown,
  rewrite: (ref: string) => string,
): unknown => {
  if (!isRecord(schema)) return schema;
  const result: SchemaRecord = { ...schema };
  if (typeof result['$ref'] === 'string') {
    result['$ref'] = rewrite(result['$ref']);
  }
  const discriminator = result['discriminator'];
  if (isRecord(discriminator) && isRecord(discriminator['mapping'])) {
    result['discriminator'] = {
      ...discriminator,
      mapping: Object.fromEntries(
        Object.entries(discriminator['mapping']).map(([key, ref]) => [
          key,
          typeof ref === 'string' ? rewrite(ref) : ref,
        ]),
      ),
    };
  }
  return mapSubschemas(result, (sub) => mapSchemaRefs(sub, rewrite));
};

const mapEntries = (
  value: unknown,
  f: (item: unknown, key: string) => unknown,
): unknown =>
  isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, f(item, key)]),
      )
    : value;

const mapSchemaField = (
  holder: unknown,
  f: (schema: unknown, contentType?: string) => unknown,
  contentType?: string,
): unknown =>
  isRecord(holder) && 'schema' in holder
    ? { ...holder, schema: f(holder['schema'], contentType) }
    : holder;

const mapContent = (
  content: unknown,
  f: (schema: unknown, contentType?: string) => unknown,
): unknown =>
  mapEntries(content, (mediaType, contentType) =>
    mapSchemaField(mediaType, f, contentType),
  );

const mapOperation = (
  operation: unknown,
  f: (schema: unknown, contentType?: string) => unknown,
): unknown => {
  if (!isRecord(operation)) return operation;
  const result: SchemaRecord = { ...operation };
  if (Array.isArray(result['parameters'])) {
    result['parameters'] = result['parameters'].map((parameter) =>
      mapSchemaField(parameter, f),
    );
  }
  const requestBody = result['requestBody'];
  if (isRecord(requestBody) && 'content' in requestBody) {
    result['requestBody'] = {
      ...requestBody,
      content: mapContent(requestBody['content'], f),
    };
  }
  if (!('responses' in result)) return result;
  result['responses'] = mapEntries(result['responses'], (response) => {
    if (!isRecord(response)) return response;
    return {
      ...response,
      ...('content' in response && {
        content: mapContent(response['content'], f),
      }),
      ...('headers' in response && {
        headers: mapEntries(response['headers'], (header) =>
          mapSchemaField(header, f),
        ),
      }),
    };
  });
  return result;
};

/**
 * A copy of `paths` with `f` applied to every schema an operation holds: each
 * parameter's `schema`, each request-body and response media type's `schema`,
 * and each response header's `schema`. Visits every `OPERATION_KEYS` entry and
 * every entry of a 3.2 `additionalOperations` map; leaves other path-item
 * fields as they are. `f` also gets the media type key for a media type's
 * schema.
 */
export const mapOperationSchemas = <P>(
  paths: P,
  f: (schema: unknown, contentType?: string) => unknown,
): P =>
  mapEntries(paths, (pathItem) => {
    if (!isRecord(pathItem)) return pathItem;
    const result: SchemaRecord = { ...pathItem };
    for (const key of Object.keys(result)) {
      if (OPERATION_KEYS.has(key)) result[key] = mapOperation(result[key], f);
    }
    if (isRecord(result['additionalOperations'])) {
      result['additionalOperations'] = mapEntries(
        result['additionalOperations'],
        (operation) => mapOperation(operation, f),
      );
    }
    return result;
  }) as P;
