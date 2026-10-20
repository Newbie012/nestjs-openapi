/**
 * Schema Name Normalizer
 *
 * Transforms ugly generic type names into clean, readable names.
 * For example: `SelectRule<structure-1949804971-...>` → `SelectRule`
 */

import type { GeneratedSchemas, JsonSchema } from './schema-generator.js';

/**
 * Pattern to match internal structure/class references
 * Examples:
 * - `structure-1949804971-123-456-789`
 * - `structure-src_dto.ts-123-456-789` (the generator keeps a short file name verbatim, and cuts it by the working directory)
 * - `class-1038812259-491-2678-1038812259-0-2679`
 */
const STRUCTURE_REF_PATTERN = /^(?:structure|class)-[^<>,\s]*\d$/;

/**
 * Pattern to match structure/class references inside generic type parameters
 * Examples:
 * - `SelectRule<structure-1949804971-123-456>`
 * - `Relation<class-1038812259-491-2678-...>`
 */
const CONTAINS_STRUCTURE_REF_PATTERN = /(?:structure|class)-[^<>,\s]*\d/;

/**
 * Check if a name contains ugly structure references that should be normalized
 */
const containsUglyStructureRef = (name: string): boolean => {
  const decoded = decodeURIComponent(name);
  return CONTAINS_STRUCTURE_REF_PATTERN.test(decoded);
};

/** Recursively traverse schema and apply a transform function to nested schemas */
const traverseSchema = (
  schema: JsonSchema,
  transform: (s: JsonSchema) => JsonSchema,
): JsonSchema => {
  const updated: Record<string, unknown> = { ...transform(schema) };

  if (schema.properties) {
    updated.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [
        key,
        traverseSchema(value, transform),
      ]),
    );
  }

  if (Array.isArray(schema.items)) {
    updated.items = schema.items.map((s) => traverseSchema(s, transform));
  } else if (schema.items) {
    updated.items = traverseSchema(schema.items as JsonSchema, transform);
  }

  if (typeof schema.additionalItems === 'object') {
    updated.additionalItems = traverseSchema(schema.additionalItems, transform);
  }

  if (schema.oneOf) {
    updated.oneOf = schema.oneOf.map((s) => traverseSchema(s, transform));
  }

  if (schema.anyOf) {
    updated.anyOf = schema.anyOf.map((s) => traverseSchema(s, transform));
  }

  if (schema.allOf) {
    updated.allOf = schema.allOf.map((s) => traverseSchema(s, transform));
  }

  if (
    schema.additionalProperties &&
    typeof schema.additionalProperties === 'object'
  ) {
    updated.additionalProperties = traverseSchema(
      schema.additionalProperties,
      transform,
    );
  }

  return updated as JsonSchema;
};

/**
 * Extract the schema name from a $ref string
 * Example: `#/definitions/User` → `User`
 * Example: `#/components/schemas/User` → `User`
 */
const extractRefName = (ref: string): string => {
  const match = ref.match(/^#\/(?:definitions|components\/schemas)\/(.+)$/);
  return match ? match[1] : ref;
};

/**
 * Convert a string to PascalCase
 * Examples:
 * - `namespaceLabels` → `NamespaceLabels`
 * - `k8sLabels` → `K8sLabels`
 * - `NamespaceLabels` → `NamespaceLabels` (unchanged)
 */
export const toPascalCase = (str: string): string => {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
};

/**
 * Represents where a structure ref is used
 */
interface StructureUsage {
  /** Parent schema name (e.g., "VulnerabilityRules") */
  readonly parent: string;
  /** Property key where the ref is used (e.g., "namespaceLabels") */
  readonly property: string;
  /** The full ref value (e.g., "SelectRule<structure-123>") */
  readonly fullRef: string;
  /** Whether this is a direct ref or wrapped in a generic */
  readonly isWrapped: boolean;
  /** The wrapper type if wrapped (e.g., "SelectRule") */
  readonly wrapper?: string;
}

/**
 * Extract structure ref from a schema name or ref
 * Examples:
 * - `structure-123-456` → `structure-123-456`
 * - `SelectRule<structure-123>` → `structure-123`
 * - `User` → null
 */
const extractStructureRef = (name: string): string | null => {
  if (STRUCTURE_REF_PATTERN.test(name)) {
    return name;
  }

  const match = CONTAINS_STRUCTURE_REF_PATTERN.exec(name);
  return match ? match[0] : null;
};

/**
 * Find all usages of structure refs with their context
 */
const findStructureUsages = (
  schemas: GeneratedSchemas,
): Map<string, StructureUsage[]> => {
  const usages = new Map<string, StructureUsage[]>();

  const recordUsage = (
    structureRef: string,
    parent: string,
    property: string,
    fullRef: string,
  ) => {
    const isWrapped = fullRef !== structureRef;
    const wrapper = isWrapped ? fullRef.match(/^([^<]+)</)?.[1] : undefined;

    const usage: StructureUsage = {
      parent,
      property,
      fullRef,
      isWrapped,
      wrapper,
    };

    const existing = usages.get(structureRef) ?? [];
    existing.push(usage);
    usages.set(structureRef, existing);
  };

  for (const [schemaName, schema] of Object.entries(schemas.definitions)) {
    if (STRUCTURE_REF_PATTERN.test(schemaName)) {
      continue;
    }

    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        if (propSchema.$ref) {
          const refName = extractRefName(propSchema.$ref);
          const structureRef = extractStructureRef(refName);

          if (structureRef) {
            recordUsage(structureRef, schemaName, propName, refName);
          }
        }

        for (const member of [
          ...(propSchema.anyOf ?? []),
          ...(propSchema.oneOf ?? []),
          ...(propSchema.allOf ?? []),
        ]) {
          const refName = member.$ref ? extractRefName(member.$ref) : '';
          const structureRef = extractStructureRef(refName);
          if (structureRef) {
            recordUsage(structureRef, schemaName, propName, refName);
          }
        }

        const items = Array.isArray(propSchema.items)
          ? undefined
          : (propSchema.items as JsonSchema | undefined);
        if (items?.$ref) {
          const refName = extractRefName(items.$ref);
          const structureRef = extractStructureRef(refName);

          if (structureRef) {
            recordUsage(structureRef, schemaName, propName, refName);
          }
        }
      }
    }
  }

  return usages;
};

/**
 * Replace structure ref in a name with a new name
 * Examples:
 * - replaceStructureInName("structure-123", "structure-123", "Labels") → "Labels"
 * - replaceStructureInName("SelectRule<structure-123>", "structure-123", "Labels") → "SelectRule<Labels>"
 */
const replaceStructureInName = (
  name: string,
  structureRef: string,
  newName: string,
): string => {
  return name.replace(structureRef, newName);
};

/**
 * Update all $ref values in a schema, replacing structure refs with new names
 */
const updateRefsWithMapping = (
  schema: JsonSchema,
  structureMapping: Map<string, string>,
): JsonSchema =>
  traverseSchema(schema, (s) => {
    if (!s.$ref) return s;

    let refName = extractRefName(s.$ref);

    for (const [structureRef, newName] of structureMapping) {
      if (refName.includes(structureRef)) {
        refName = replaceStructureInName(refName, structureRef, newName);
      }
    }

    return { ...s, $ref: `#/components/schemas/${refName}` };
  });

const SOLE_STRUCTURE_ARGUMENT = /^[^<]+<((?:structure|class)-[^<>,\s]*\d)>$/;

const isRefOnly = (schema: JsonSchema) =>
  typeof schema.$ref === 'string' &&
  Object.keys(schema).every((key) => key === '$ref' || key === 'description');

const namesOfAliasedDeclarations = (schemas: GeneratedSchemas) => {
  const names = new Map<string, string>();
  for (const [name, schema] of Object.entries(schemas.definitions)) {
    const structureRef = SOLE_STRUCTURE_ARGUMENT.exec(name)?.[1];
    if (!structureRef || !isRefOnly(schema)) continue;
    const target = extractRefName(schema.$ref!);
    if (containsUglyStructureRef(target)) continue;
    names.set(structureRef, target);
  }
  return names;
};

/** Find a unique name using cascading strategy: property → parent+property → suffix */
const findUniqueName = (
  propertyName: string,
  parentName: string,
  usedNames: Set<string>,
): string => {
  if (!usedNames.has(propertyName)) return propertyName;

  const withParent = `${parentName}${propertyName}`;
  if (!usedNames.has(withParent)) return withParent;

  let suffix = 1;
  while (usedNames.has(`${withParent}_${suffix}`)) {
    suffix++;
  }
  return `${withParent}_${suffix}`;
};

/**
 * Normalize structure refs to readable names based on usage context.
 *
 * Uses a cascading naming strategy:
 * 1. Property key as PascalCase (e.g., "namespaceLabels" → "NamespaceLabels")
 * 2. If collision: Parent + Property (e.g., "VulnerabilityRulesNamespaceLabels")
 * 3. If still collision: Add numeric suffix (e.g., "VulnerabilityRulesNamespaceLabels_1")
 *
 * This transforms ugly refs like:
 * - `SelectRule<structure-1231915544-...>` → `SelectRule<NamespaceLabels>`
 * - `structure-123-456` → `Labels`
 */
export const normalizeStructureRefs = (
  schemas: GeneratedSchemas,
): GeneratedSchemas => {
  const reservedNames = new Set<string>();
  for (const name of Object.keys(schemas.definitions)) {
    if (!STRUCTURE_REF_PATTERN.test(name) && !containsUglyStructureRef(name)) {
      reservedNames.add(name);
    }
  }

  const structureUsages = findStructureUsages(schemas);

  const structureMapping = namesOfAliasedDeclarations(schemas);
  const usedNames = new Set(reservedNames);

  for (const [structureRef, usages] of structureUsages) {
    if (usages.length === 0 || structureMapping.has(structureRef)) continue;

    const { parent, property } = usages[0];
    const propertyPascal = toPascalCase(property);

    const newName = findUniqueName(propertyPascal, parent, usedNames);

    structureMapping.set(structureRef, newName);
    usedNames.add(newName);
  }

  const normalizedDefinitions: Record<string, JsonSchema> = {};

  for (const [originalName, schema] of Object.entries(schemas.definitions)) {
    const newName = resolveNewSchemaName(originalName, structureMapping);
    if (newName === null) continue;

    const updatedSchema = updateRefsWithMapping(schema, structureMapping);
    normalizedDefinitions[newName] = updatedSchema;
  }

  return { definitions: normalizedDefinitions };
};

/** Resolve new schema name, returning null if schema should be skipped */
const resolveNewSchemaName = (
  originalName: string,
  structureMapping: Map<string, string>,
): string | null => {
  if (STRUCTURE_REF_PATTERN.test(originalName)) {
    return structureMapping.get(originalName) ?? null;
  }

  if (containsUglyStructureRef(originalName)) {
    for (const [structureRef, mappedName] of structureMapping) {
      if (originalName.includes(structureRef)) {
        return replaceStructureInName(originalName, structureRef, mappedName);
      }
    }
  }

  return originalName;
};
