/**
 * Schema Name Normalizer
 *
 * Transforms ugly generic type names into clean, readable names.
 * For example: `SelectRule<structure-1949804971-...>` → `SelectRule`
 */

import type { GeneratedSchemas, JsonSchema } from './schema-generator.js';

/**
 * Pattern to match ugly generated type names
 * Examples:
 * - `SelectRule<structure-1949804971-123-456>`
 * - `Pick<User,_id_|_name_>`
 * - `Omit<Post,_createdAt_>`
 * Also handles URL-encoded versions:
 * - `SelectRule%3Cstructure-1949804971-123-456%3E`
 */
const UGLY_NAME_PATTERN = /^(.+?)<.*>$/;
const UGLY_NAME_PATTERN_ENCODED = /^(.+?)%3C.*%3E$/i;

/**
 * Pattern to match numeric suffixes added for uniqueness
 * Examples:
 * - `User_1`
 * - `CreateUserDto_123`
 */
// Reserved for future use in deduplication
// const NUMERIC_SUFFIX_PATTERN = /^(.+?)_\d+$/;

/**
 * Pattern to match internal structure/class references
 * Examples:
 * - `structure-1949804971-123-456-789`
 * - `class-1038812259-491-2678-1038812259-0-2679`
 */
const UGLY_REF_PATTERN = /^(?:structure|class)-\d+(-\d+)*$/;

/**
 * Pattern to match structure/class references inside generic type parameters
 * Examples:
 * - `SelectRule<structure-1949804971-123-456>`
 * - `Relation<class-1038812259-491-2678-...>`
 */
const CONTAINS_UGLY_REF_PATTERN = /(?:structure|class)-\d+(-\d+)*/;

// Keep old names as aliases for backward compatibility
const STRUCTURE_REF_PATTERN = UGLY_REF_PATTERN;
const CONTAINS_STRUCTURE_REF_PATTERN = CONTAINS_UGLY_REF_PATTERN;

export interface NormalizerOptions {
  /**
   * Whether to preserve the base name when stripping generics
   * @default true
   */
  readonly preserveBaseName?: boolean;

  /**
   * Whether to deduplicate names with numeric suffixes
   * @default false
   */
  readonly deduplicateSuffixes?: boolean;

  /**
   * Custom name mapping for specific types
   */
  readonly customNames?: Record<string, string>;
}

/**
 * Check if a name contains ugly structure references that should be normalized
 */
const containsUglyStructureRef = (name: string): boolean => {
  // Check for structure-123... patterns (both encoded and non-encoded)
  const decoded = decodeURIComponent(name);
  return CONTAINS_STRUCTURE_REF_PATTERN.test(decoded);
};

/**
 * Normalize a schema name to be more readable
 *
 * IMPORTANT: Only normalizes names with ugly structure references.
 * Clean generic types like SelectRule<string> are preserved.
 */
export const normalizeSchemaName = (
  name: string,
  options: NormalizerOptions = {},
): string => {
  const { preserveBaseName = true, customNames = {} } = options;

  // Check custom names first
  if (customNames[name]) {
    return customNames[name];
  }

  // Skip internal structure references - these should be inlined
  if (STRUCTURE_REF_PATTERN.test(name)) {
    return name; // Keep as-is, will be handled separately
  }

  // Only normalize if the name contains ugly structure references
  // Clean generic types like SelectRule<string> should be preserved
  if (!containsUglyStructureRef(name)) {
    return name;
  }

  let normalized = name;

  // Strip generic type parameters only for ugly names (handles both encoded and non-encoded)
  if (preserveBaseName) {
    // Try URL-encoded pattern first (e.g., SelectRule%3Cstructure-...%3E)
    const encodedMatch = UGLY_NAME_PATTERN_ENCODED.exec(normalized);
    if (encodedMatch) {
      normalized = encodedMatch[1];
    } else {
      // Try non-encoded pattern (e.g., SelectRule<structure-...>)
      const genericMatch = UGLY_NAME_PATTERN.exec(normalized);
      if (genericMatch) {
        normalized = genericMatch[1];
      }
    }
  }

  // If the name still contains structure references, it should be stripped
  // This handles cases like SelectRule_with_structure where the generic was partially processed
  if (CONTAINS_STRUCTURE_REF_PATTERN.test(normalized)) {
    // Try to extract just the base type name before any structure reference
    const match = normalized.match(/^([A-Za-z][A-Za-z0-9]*)/);
    if (match) {
      normalized = match[1];
    }
  }

  return normalized;
};

/**
 * Build a name mapping from original names to normalized names
 * Handles collisions by appending numeric suffixes
 */
export const buildNameMapping = (
  names: readonly string[],
  options: NormalizerOptions = {},
): Map<string, string> => {
  const mapping = new Map<string, string>();
  const usedNames = new Map<string, number>();

  for (const originalName of names) {
    const baseName = normalizeSchemaName(originalName, options);

    // Track how many times we've seen this base name
    const count = usedNames.get(baseName) ?? 0;
    usedNames.set(baseName, count + 1);

    // First occurrence uses the base name, subsequent occurrences get suffixes
    const finalName = count === 0 ? baseName : `${baseName}_${count}`;
    mapping.set(originalName, finalName);
  }

  return mapping;
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

  if (schema.items) {
    updated.items = traverseSchema(schema.items, transform);
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
 * Update all $ref values in a schema to use normalized names
 */
const updateRefs = (
  schema: JsonSchema,
  nameMapping: Map<string, string>,
): JsonSchema =>
  traverseSchema(schema, (s) => {
    if (!s.$ref) return s;

    const refName = extractRefName(s.$ref);
    const mappedName = nameMapping.get(refName);

    if (mappedName && mappedName !== refName) {
      return { ...s, $ref: `#/components/schemas/${mappedName}` };
    }

    if (!containsUglyStructureRef(refName)) return s;

    const normalizedRefName = normalizeSchemaName(refName);
    if (normalizedRefName === refName) return s;

    return { ...s, $ref: `#/components/schemas/${normalizedRefName}` };
  });

/**
 * Extract the schema name from a $ref string
 * Example: `#/definitions/User` → `User`
 * Example: `#/components/schemas/User` → `User`
 */
const extractRefName = (ref: string): string => {
  // Handle both #/definitions/Name and #/components/schemas/Name
  const match = ref.match(/^#\/(?:definitions|components\/schemas)\/(.+)$/);
  return match ? match[1] : ref;
};

/**
 * Convert $ref from #/definitions to #/components/schemas format
 */
const convertRefFormat = (schema: JsonSchema): JsonSchema =>
  traverseSchema(schema, (s) => {
    if (!s.$ref?.startsWith('#/definitions/')) return s;
    const name = s.$ref.replace('#/definitions/', '');
    return { ...s, $ref: `#/components/schemas/${name}` };
  });

/**
 * Normalize all schema names in a GeneratedSchemas object
 */
export const normalizeSchemas = (
  schemas: GeneratedSchemas,
  options: NormalizerOptions = {},
): GeneratedSchemas => {
  const originalNames = Object.keys(schemas.definitions);
  const nameMapping = buildNameMapping(originalNames, options);

  const normalizedDefinitions: Record<string, JsonSchema> = {};

  for (const [originalName, schema] of Object.entries(schemas.definitions)) {
    const newName = nameMapping.get(originalName) ?? originalName;

    // Convert refs and update to new names
    let updatedSchema = convertRefFormat(schema);
    updatedSchema = updateRefs(updatedSchema, nameMapping);

    normalizedDefinitions[newName] = updatedSchema;
  }

  return { definitions: normalizedDefinitions };
};

/**
 * Filter out internal/temporary schemas that shouldn't be exposed
 */
export const filterInternalSchemas = (
  schemas: GeneratedSchemas,
): GeneratedSchemas => {
  const filteredDefinitions: Record<string, JsonSchema> = {};

  for (const [name, schema] of Object.entries(schemas.definitions)) {
    // Skip internal structure references
    if (STRUCTURE_REF_PATTERN.test(name)) {
      continue;
    }

    // Skip schemas that are just internal references
    if (
      schema.$ref &&
      STRUCTURE_REF_PATTERN.test(extractRefName(schema.$ref))
    ) {
      continue;
    }

    filteredDefinitions[name] = schema;
  }

  return { definitions: filteredDefinitions };
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
  // Capitalize first letter, keep rest as-is
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
  // Direct structure ref
  if (STRUCTURE_REF_PATTERN.test(name)) {
    return name;
  }

  // Structure ref inside generic
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

  // Walk through all schemas and find structure refs in properties
  for (const [schemaName, schema] of Object.entries(schemas.definitions)) {
    // Skip structure refs themselves
    if (STRUCTURE_REF_PATTERN.test(schemaName)) {
      continue;
    }

    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        // Check direct $ref
        if (propSchema.$ref) {
          const refName = extractRefName(propSchema.$ref);
          const structureRef = extractStructureRef(refName);

          if (structureRef) {
            recordUsage(structureRef, schemaName, propName, refName);
          }
        }

        // Check array items.$ref
        if (propSchema.items?.$ref) {
          const refName = extractRefName(propSchema.items.$ref);
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

/** Find a unique name using cascading strategy: property → parent+property → suffix */
const findUniqueName = (
  propertyName: string,
  parentName: string,
  usedNames: Set<string>,
): string => {
  // Level 1: Just property name
  if (!usedNames.has(propertyName)) return propertyName;

  // Level 2: Parent + Property
  const withParent = `${parentName}${propertyName}`;
  if (!usedNames.has(withParent)) return withParent;

  // Level 3: Add numeric suffix
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
  // 1. Collect all existing schema names (reserved - can't use these)
  const reservedNames = new Set<string>();
  for (const name of Object.keys(schemas.definitions)) {
    if (!STRUCTURE_REF_PATTERN.test(name) && !containsUglyStructureRef(name)) {
      reservedNames.add(name);
    }
  }

  // 2. Find all structure refs and their usage context
  const structureUsages = findStructureUsages(schemas);

  // 3. Build mapping from structure refs to new names
  const structureMapping = new Map<string, string>();
  const usedNames = new Set(reservedNames);

  for (const [structureRef, usages] of structureUsages) {
    if (usages.length === 0) continue;

    const { parent, property } = usages[0];
    const propertyPascal = toPascalCase(property);

    // Cascading naming strategy: property → parent+property → suffix
    const newName = findUniqueName(propertyPascal, parent, usedNames);

    structureMapping.set(structureRef, newName);
    usedNames.add(newName);
  }

  // 4. Build new definitions with renamed schemas
  const normalizedDefinitions: Record<string, JsonSchema> = {};

  for (const [originalName, schema] of Object.entries(schemas.definitions)) {
    const newName = resolveNewSchemaName(originalName, structureMapping);
    if (newName === null) continue; // Skip unused structure refs

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
  // Direct structure ref - must be in mapping or skip
  if (STRUCTURE_REF_PATTERN.test(originalName)) {
    return structureMapping.get(originalName) ?? null;
  }

  // Generic containing structure ref - replace with mapped name
  if (containsUglyStructureRef(originalName)) {
    for (const [structureRef, mappedName] of structureMapping) {
      if (originalName.includes(structureRef)) {
        return replaceStructureInName(originalName, structureRef, mappedName);
      }
    }
  }

  return originalName;
};
