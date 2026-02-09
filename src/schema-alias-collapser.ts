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

const rewriteRefs = <T>(
  value: T,
  rewriteRef: (ref: string) => string,
): T => {
  if (Array.isArray(value)) {
    return value.map((item) => rewriteRefs(item, rewriteRef)) as T;
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const result: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (key === '$ref' && typeof nestedValue === 'string') {
      result[key] = rewriteRef(nestedValue);
      continue;
    }

    result[key] = rewriteRefs(nestedValue, rewriteRef);
  }

  return result as T;
};

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

  const rewrittenPaths = rewriteRefs(paths, rewriteRef);
  const rewrittenSchemas = rewriteRefs(schemas, rewriteRef);

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
