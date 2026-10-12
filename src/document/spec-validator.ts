/**
 * OpenAPI spec validation utilities.
 *
 * Validates that generated specs don't have broken $ref references
 * or other common issues.
 */

import { Validator } from '@seriousme/openapi-schema-validator';
import type { OpenApiSpec } from '../config/types.js';

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
 * A place where the document breaks the OpenAPI specification
 */
export interface StructuralError {
  /** JSON pointer to the offending value */
  readonly path: string;
  readonly message: string;
}

/**
 * Result of spec validation
 */
export interface ValidationResult {
  /** Whether the spec is valid: no broken refs, nor structural errors */
  readonly valid: boolean;
  /**
   * Breaks of the OpenAPI specification for the document's version. Set by
   * generate(), which checks the document against the official schema;
   * validateSpec() checks references only and leaves it out
   */
  readonly structuralErrors?: readonly StructuralError[];
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

const decodePointerSegment = (segment: string) =>
  segment.replace(/~1/g, '/').replace(/~0/g, '~');

const valueAt = (document: unknown, pointer: string): unknown =>
  pointer
    .split('/')
    .slice(1)
    .reduce<unknown>(
      (value, segment) =>
        value && typeof value === 'object'
          ? (value as Record<string, unknown>)[decodePointerSegment(segment)]
          : undefined,
      document,
    );

// The JSON Schema of OpenAPI 3.0 cannot say that `nullable` needs a `type`
// beside it, which the 3.0.3 text requires
const findUntypedNullables = (
  value: unknown,
  pointer: string,
): StructuralError[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findUntypedNullables(item, `${pointer}/${index}`),
    );
  }
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const own =
    'nullable' in record && record['type'] === undefined
      ? [
          {
            path: `${pointer}/nullable`,
            message: '`nullable` needs a `type` in the same schema',
          },
        ]
      : [];
  return [
    ...own,
    ...Object.entries(record).flatMap(([key, item]) =>
      findUntypedNullables(
        item,
        `${pointer}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`,
      ),
    ),
  ];
};

type AjvError = {
  readonly instancePath?: string;
  readonly message?: string;
  readonly keyword?: string;
  readonly params?: { readonly missingProperty?: string };
};

// A failed `oneOf` or `if` reports each branch it tried, and the Reference
// Object branch's missing `$ref`, beside the error that matters
const isBranchNoise = ({ keyword, params }: AjvError) =>
  keyword === 'oneOf' ||
  keyword === 'if' ||
  (keyword === 'required' && params?.missingProperty === '$ref');

/**
 * Checks a document against the official OpenAPI schema for its version
 * (and, for 3.0, the rules that schema cannot express).
 */
export async function validateStructure(
  spec: OpenApiSpec,
): Promise<readonly StructuralError[]> {
  // The validator keeps the document it reads, so it gets a copy
  const document = structuredClone(spec);
  const result = await new Validator().validate(
    document as unknown as Parameters<Validator['validate']>[0],
  );
  const schemaErrors: StructuralError[] = result.valid
    ? []
    : typeof result.errors === 'string'
      ? [{ path: '', message: result.errors }]
      : ((result.errors ?? []) as readonly AjvError[])
          .filter((error) => !isBranchNoise(error))
          .map(({ instancePath = '', message = 'is invalid' }) => ({
            path: instancePath,
            message: `${message}${describeValue(valueAt(spec, instancePath))}`,
          }));
  const nullableErrors = spec.openapi.startsWith('3.0')
    ? findUntypedNullables(spec, '')
    : [];
  return [...schemaErrors, ...nullableErrors];
}

const describeValue = (value: unknown) => {
  const text = JSON.stringify(value);
  return text === undefined
    ? ''
    : ` (got ${text.length > 60 ? `${text.slice(0, 57)}...` : text})`;
};

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

  const structural = result.structuralErrors ?? [];
  const structuralLines =
    structural.length === 0
      ? []
      : [
          `Found ${structural.length} places that break the OpenAPI specification:`,
          ...structural
            .slice(0, 20)
            .map(({ path, message }) => `    - ${path || '/'}: ${message}`),
          ...(structural.length > 20
            ? [`    ... and ${structural.length - 20} more`]
            : []),
        ];
  if (result.brokenRefCount === 0) return structuralLines.join('\n');

  const lines: string[] = [
    ...(structuralLines.length > 0 ? [...structuralLines, ''] : []),
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
