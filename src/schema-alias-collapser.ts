import type { OpenApiPaths, OpenApiSchema } from './types.js';

const COMPONENT_SCHEMA_REF_PREFIX = '#/components/schemas/';
const ALIAS_SCHEMA_KEYS = new Set(['$ref', 'description']);

const extractSchemaRefName = (ref: string): string | null =>
  ref.startsWith(COMPONENT_SCHEMA_REF_PREFIX)
    ? ref.slice(COMPONENT_SCHEMA_REF_PREFIX.length)
    : null;

const toSchemaRef = (name: string): string =>
  `${COMPONENT_SCHEMA_REF_PREFIX}${name}`;

const isAliasSchema = (schema: OpenApiSchema): boolean => {
  if (!schema.$ref) return false;
  return Object.keys(schema as Record<string, unknown>).every((key) =>
    ALIAS_SCHEMA_KEYS.has(key),
  );
};

const rewriteSchemaRefs = (
  schema: OpenApiSchema,
  rewriteRef: (ref: string) => string,
): OpenApiSchema => {
  const result: Record<string, unknown> = { ...schema };

  if (typeof schema.$ref === 'string') {
    result['$ref'] = rewriteRef(schema.$ref);
  }

  if (schema.items) {
    result['items'] = rewriteSchemaRefs(schema.items, rewriteRef);
  }

  if (schema.oneOf) {
    result['oneOf'] = schema.oneOf.map((item) =>
      rewriteSchemaRefs(item, rewriteRef),
    );
  }

  if (schema.anyOf) {
    result['anyOf'] = schema.anyOf.map((item) =>
      rewriteSchemaRefs(item, rewriteRef),
    );
  }

  if (schema.allOf) {
    result['allOf'] = schema.allOf.map((item) =>
      rewriteSchemaRefs(item, rewriteRef),
    );
  }

  if (schema.properties) {
    result['properties'] = Object.fromEntries(
      Object.entries(schema.properties).map(([key, propertySchema]) => [
        key,
        rewriteSchemaRefs(propertySchema, rewriteRef),
      ]),
    );
  }

  if (
    schema.additionalProperties &&
    typeof schema.additionalProperties === 'object'
  ) {
    result['additionalProperties'] = rewriteSchemaRefs(
      schema.additionalProperties,
      rewriteRef,
    );
  }

  return result as OpenApiSchema;
};

const rewritePathsRefs = (
  paths: OpenApiPaths,
  rewriteRef: (ref: string) => string,
): OpenApiPaths =>
  Object.fromEntries(
    Object.entries(paths).map(([path, methods]) => [
      path,
      Object.fromEntries(
        Object.entries(methods).map(([method, operation]) => [
          method,
          {
            ...operation,
            ...(operation.parameters && {
              parameters: operation.parameters.map((parameter) => ({
                ...parameter,
                schema: rewriteSchemaRefs(parameter.schema, rewriteRef),
              })),
            }),
            ...(operation.requestBody && {
              requestBody: {
                ...operation.requestBody,
                content: Object.fromEntries(
                  Object.entries(operation.requestBody.content).map(
                    ([contentType, content]) => [
                      contentType,
                      {
                        ...content,
                        schema: rewriteSchemaRefs(content.schema, rewriteRef),
                      },
                    ],
                  ),
                ),
              },
            }),
            responses: Object.fromEntries(
              Object.entries(operation.responses).map(([statusCode, response]) => [
                statusCode,
                response.content
                  ? {
                      ...response,
                      content: Object.fromEntries(
                        Object.entries(response.content).map(
                          ([contentType, content]) => [
                            contentType,
                            {
                              ...content,
                              schema: rewriteSchemaRefs(content.schema, rewriteRef),
                            },
                          ],
                        ),
                      ),
                    }
                  : response,
              ]),
            ),
          },
        ]),
      ),
    ]),
  ) as OpenApiPaths;

const rewriteSchemasRefs = (
  schemas: Record<string, OpenApiSchema>,
  rewriteRef: (ref: string) => string,
): Record<string, OpenApiSchema> =>
  Object.fromEntries(
    Object.entries(schemas).map(([name, schema]) => [
      name,
      rewriteSchemaRefs(schema, rewriteRef),
    ]),
  ) as Record<string, OpenApiSchema>;

const resolveAliasTargets = (
  schemas: Record<string, OpenApiSchema>,
): Map<string, string> => {
  const directAliases = new Map<string, string>();

  for (const [name, schema] of Object.entries(schemas)) {
    if (!isAliasSchema(schema) || !schema.$ref) continue;
    const target = extractSchemaRefName(schema.$ref);
    if (!target) continue;
    directAliases.set(name, target);
  }

  const resolvedAliases = new Map<string, string>();

  const resolveFinalTarget = (start: string): string | null => {
    const visited = new Set<string>([start]);
    let current = start;

    while (true) {
      const next = directAliases.get(current);
      if (!next) return current === start ? null : current;
      if (!(next in schemas)) return null;
      if (visited.has(next)) return null;
      visited.add(next);
      current = next;
    }
  };

  for (const aliasName of directAliases.keys()) {
    const finalTarget = resolveFinalTarget(aliasName);
    if (!finalTarget || finalTarget === aliasName) continue;
    resolvedAliases.set(aliasName, finalTarget);
  }

  return resolvedAliases;
};

export interface CollapseAliasRefsResult {
  readonly paths: OpenApiPaths;
  readonly schemas: Record<string, OpenApiSchema>;
}

/**
 * Collapse alias schemas (A -> B, where A is only a $ref wrapper) to direct refs.
 *
 * This rewrites all refs in paths/schemas to the final non-alias target and then
 * removes alias schemas that no longer carry semantic value.
 */
export const collapseAliasRefs = (
  paths: OpenApiPaths,
  schemas: Record<string, OpenApiSchema>,
): CollapseAliasRefsResult => {
  const aliasTargets = resolveAliasTargets(schemas);
  if (aliasTargets.size === 0) return { paths, schemas };

  const rewriteRef = (ref: string): string => {
    const refName = extractSchemaRefName(ref);
    if (!refName) return ref;
    const finalTarget = aliasTargets.get(refName);
    return finalTarget ? toSchemaRef(finalTarget) : ref;
  };

  const rewrittenPaths = rewritePathsRefs(paths, rewriteRef);
  const rewrittenSchemas = rewriteSchemasRefs(schemas, rewriteRef);

  const collapsedSchemas = Object.fromEntries(
    Object.entries(rewrittenSchemas).filter(
      ([name]) => !aliasTargets.has(name),
    ),
  ) as Record<string, OpenApiSchema>;

  return {
    paths: rewrittenPaths,
    schemas: collapsedSchemas,
  };
};
