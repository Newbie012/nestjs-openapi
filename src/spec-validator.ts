/**
 * OpenAPI spec validation utilities.
 *
 * Validates that generated specs don't have broken $ref references
 * or other common issues.
 */

import type { OpenApiSpec } from './types.js';

/**
 * A broken reference found during validation
 */
export interface BrokenRef {
  /** The $ref value that couldn't be resolved */
  readonly ref: string;
  /** The JSON path where this reference was found */
  readonly path: string;
  /** The schema name that's missing (extracted from $ref) */
  readonly missingSchema: string;
}

/**
 * Result of spec validation
 */
export interface ValidationResult {
  /** Whether the spec is valid (no broken refs) */
  readonly valid: boolean;
  /** Total number of schema refs found */
  readonly totalRefs: number;
  /** Number of broken refs */
  readonly brokenRefCount: number;
  /** Details of each broken ref */
  readonly brokenRefs: readonly BrokenRef[];
  /** Missing schema names grouped with their usage count */
  readonly missingSchemas: ReadonlyMap<string, number>;
}

/**
 * Find all $ref values in an object recursively
 */
function findRefs(
  obj: unknown,
  path: string = '',
): Array<{ ref: string; path: string }> {
  const refs: Array<{ ref: string; path: string }> = [];

  if (!obj || typeof obj !== 'object') {
    return refs;
  }

  const record = obj as Record<string, unknown>;

  if (typeof record.$ref === 'string') {
    refs.push({ ref: record.$ref, path });
  }

  for (const [key, value] of Object.entries(record)) {
    const newPath = path ? `${path}.${key}` : key;
    refs.push(...findRefs(value, newPath));
  }

  return refs;
}

/**
 * Validates an OpenAPI spec for broken $ref references.
 *
 * @param spec - The OpenAPI specification to validate
 * @returns Validation result with details about any broken refs
 *
 * @example
 * ```typescript
 * const result = validateSpec(spec);
 * if (!result.valid) {
 *   console.error(`Found ${result.brokenRefCount} broken refs:`);
 *   for (const [schema, count] of result.missingSchemas) {
 *     console.error(`  - ${schema} (${count} usages)`);
 *   }
 * }
 * ```
 */
export function validateSpec(spec: OpenApiSpec): ValidationResult {
  // Get all defined schemas
  const definedSchemas = new Set(Object.keys(spec.components?.schemas ?? {}));

  // Find all $ref values in the spec
  const allRefs = findRefs(spec);

  // Filter to just schema refs
  const schemaRefs = allRefs.filter((r) =>
    r.ref.startsWith('#/components/schemas/'),
  );

  // Find broken refs
  const brokenRefs: BrokenRef[] = [];
  const missingSchemas = new Map<string, number>();

  for (const { ref, path } of schemaRefs) {
    const schemaName = ref.replace('#/components/schemas/', '');
    if (!definedSchemas.has(schemaName)) {
      brokenRefs.push({
        ref,
        path,
        missingSchema: schemaName,
      });
      missingSchemas.set(schemaName, (missingSchemas.get(schemaName) ?? 0) + 1);
    }
  }

  return {
    valid: brokenRefs.length === 0,
    totalRefs: schemaRefs.length,
    brokenRefCount: brokenRefs.length,
    brokenRefs,
    missingSchemas,
  };
}

/**
 * Categorizes broken refs by likely cause
 */
export interface BrokenRefCategories {
  /** Primitive types that shouldn't be refs (string, number, boolean) */
  readonly primitives: readonly string[];
  /** Union types (Type | null, void | Type) */
  readonly unionTypes: readonly string[];
  /** Query/Path parameter DTOs */
  readonly queryParams: readonly string[];
  /** Other missing schemas (likely from different glob patterns) */
  readonly other: readonly string[];
}

/**
 * Categorize broken refs to help diagnose the root cause.
 *
 * @param missingSchemas - Map of missing schema names to usage count
 * @returns Categorized broken refs
 */
export function categorizeBrokenRefs(
  missingSchemas: ReadonlyMap<string, number>,
): BrokenRefCategories {
  const primitives: string[] = [];
  const unionTypes: string[] = [];
  const queryParams: string[] = [];
  const other: string[] = [];

  const primitiveTypes = new Set([
    'string',
    'number',
    'boolean',
    'object',
    'null',
    'undefined',
    'void',
    'any',
    'unknown',
    'never',
  ]);

  for (const schema of missingSchemas.keys()) {
    // Check for primitives
    if (primitiveTypes.has(schema.toLowerCase())) {
      primitives.push(schema);
      continue;
    }

    // Check for union types (contains | character)
    if (schema.includes(' | ') || schema.includes('|')) {
      unionTypes.push(schema);
      continue;
    }

    // Check for query/path param patterns
    if (
      schema.endsWith('QueryParams') ||
      schema.endsWith('PathParams') ||
      schema.endsWith('Params')
    ) {
      queryParams.push(schema);
      continue;
    }

    other.push(schema);
  }

  return {
    primitives,
    unionTypes,
    queryParams,
    other,
  };
}

/**
 * Formats validation result as a human-readable string for CLI output.
 *
 * @param result - Validation result from validateSpec
 * @returns Formatted string describing the validation issues
 */
export function formatValidationResult(result: ValidationResult): string {
  if (result.valid) {
    return `Spec is valid: ${result.totalRefs} schema refs, all resolved`;
  }

  const lines: string[] = [
    `Found ${result.brokenRefCount} broken refs (${result.missingSchemas.size} missing schemas):`,
  ];

  const categories = categorizeBrokenRefs(result.missingSchemas);

  if (categories.primitives.length > 0) {
    lines.push(`\n  Primitive types (should not be $refs):`);
    for (const name of categories.primitives) {
      const count = result.missingSchemas.get(name) ?? 0;
      lines.push(`    - ${name} (${count} usages)`);
    }
  }

  if (categories.unionTypes.length > 0) {
    lines.push(`\n  Union types (need special handling):`);
    for (const name of categories.unionTypes) {
      const count = result.missingSchemas.get(name) ?? 0;
      lines.push(`    - ${name} (${count} usages)`);
    }
  }

  if (categories.queryParams.length > 0) {
    lines.push(`\n  Query/Path params (may need dtoGlob coverage):`);
    for (const name of categories.queryParams) {
      const count = result.missingSchemas.get(name) ?? 0;
      lines.push(`    - ${name} (${count} usages)`);
    }
  }

  if (categories.other.length > 0) {
    lines.push(`\n  Other missing schemas (check dtoGlob patterns):`);
    for (const name of categories.other.slice(0, 20)) {
      const count = result.missingSchemas.get(name) ?? 0;
      lines.push(`    - ${name} (${count} usages)`);
    }
    if (categories.other.length > 20) {
      lines.push(`    ... and ${categories.other.length - 20} more`);
    }
  }

  return lines.join('\n');
}
