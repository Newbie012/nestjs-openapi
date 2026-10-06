import type { OpenApiPaths, OpenApiSchema } from './types.js';

const REF_PREFIX = '#/components/schemas/';

// A component that references itself, directly or not, cannot be inlined
// and stays a component
export const inlineSchemas = (
  paths: OpenApiPaths,
  schemas: Record<string, OpenApiSchema>,
  names: ReadonlySet<string>,
) => {
  if (names.size === 0) return { paths, schemas, kept: [] as string[] };

  const kept = new Set<string>();
  const inlineValue = (value: unknown, stack: readonly string[]): unknown => {
    if (Array.isArray(value))
      return value.map((item) => inlineValue(item, stack));
    if (!value || typeof value !== 'object') return value;

    const record = value as Record<string, unknown>;
    const ref = record['$ref'];
    if (typeof ref === 'string' && ref.startsWith(REF_PREFIX)) {
      const name = ref.slice(REF_PREFIX.length);
      if (names.has(name) && schemas[name]) {
        if (stack.includes(name)) {
          kept.add(name);
          return value;
        }
        const { $ref: _ref, ...siblings } = record;
        const inlined = inlineValue(schemas[name], [...stack, name]) as Record<
          string,
          unknown
        >;
        return { ...inlined, ...siblings };
      }
    }

    return Object.fromEntries(
      Object.entries(record).map(([key, item]) => [
        key,
        inlineValue(item, stack),
      ]),
    );
  };

  const inlinedPaths = inlineValue(paths, []) as OpenApiPaths;
  const remaining = Object.fromEntries(
    Object.entries(schemas)
      .filter(([name]) => !names.has(name))
      .map(([name, schema]) => [
        name,
        inlineValue(schema, [name]) as OpenApiSchema,
      ]),
  );
  for (const name of kept) {
    remaining[name] = inlineValue(schemas[name], [name]) as OpenApiSchema;
  }

  return { paths: inlinedPaths, schemas: remaining, kept: [...kept] };
};
