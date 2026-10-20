import type { OpenApiPaths, OpenApiSchema } from '../config/types.js';
import {
  SCHEMA_REF_PREFIX,
  mapOperationSchemas,
  mapSchemaRefs,
} from './schema-walk.js';

const ALIAS_SCHEMA_KEYS = new Set(['$ref', 'description']);

const extractSchemaRefName = (ref: string): string | null =>
  ref.startsWith(SCHEMA_REF_PREFIX)
    ? ref.slice(SCHEMA_REF_PREFIX.length)
    : null;

const toSchemaRef = (name: string): string => `${SCHEMA_REF_PREFIX}${name}`;

const aliasTarget = (schema: OpenApiSchema) => {
  const keys = Object.keys(schema as Record<string, unknown>);
  if (schema.$ref) {
    return keys.every((key) => ALIAS_SCHEMA_KEYS.has(key))
      ? schema.$ref
      : undefined;
  }
  const [wrapped, ...others] = schema.allOf ?? [];
  if (!wrapped?.$ref || others.length > 0) return undefined;
  const wrappedKeys = Object.keys(wrapped as Record<string, unknown>);
  return wrappedKeys.length === 1 &&
    keys.every((key) => key === 'allOf' || ALIAS_SCHEMA_KEYS.has(key))
    ? wrapped.$ref
    : undefined;
};

const rewritePathsRefs = (
  paths: OpenApiPaths,
  rewriteRef: (ref: string) => string,
): OpenApiPaths =>
  mapOperationSchemas(paths, (schema) => mapSchemaRefs(schema, rewriteRef));

const rewriteSchemasRefs = (
  schemas: Record<string, OpenApiSchema>,
  rewriteRef: (ref: string) => string,
): Record<string, OpenApiSchema> =>
  Object.fromEntries(
    Object.entries(schemas).map(([name, schema]) => [
      name,
      mapSchemaRefs(schema, rewriteRef),
    ]),
  ) as Record<string, OpenApiSchema>;

const resolveAliasTargets = (
  schemas: Record<string, OpenApiSchema>,
): Map<string, string> => {
  const directAliases = new Map<string, string>();

  for (const [name, schema] of Object.entries(schemas)) {
    const ref = aliasTarget(schema);
    if (!ref) continue;
    const target = extractSchemaRefName(ref);
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
