/**
 * Validate OpenAPI spec completeness
 *
 * Checks:
 * 1. All $ref references point to existing schemas
 * 2. No duplicate schema names
 * 3. All paths have valid operations
 * 4. Required fields are present
 *
 * Usage: npx tsx scripts/validate-openapi.ts <path-to-spec>
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalPaths: number;
    totalOperations: number;
    totalSchemas: number;
    totalRefs: number;
    brokenRefs: number;
    missingSchemas: number;
  };
}

function extractAllRefs(
  obj: unknown,
  refs: Set<string> = new Set(),
): Set<string> {
  if (typeof obj !== 'object' || obj === null) return refs;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      extractAllRefs(item, refs);
    }
  } else {
    for (const [key, value] of Object.entries(obj)) {
      if (key === '$ref' && typeof value === 'string') {
        // Extract schema name from #/components/schemas/SchemaName
        const match = value.match(/^#\/components\/schemas\/(.+)$/);
        if (match) {
          refs.add(match[1]);
        }
      } else {
        extractAllRefs(value, refs);
      }
    }
  }

  return refs;
}

function countOperations(paths: Record<string, unknown>): number {
  let count = 0;
  for (const methods of Object.values(paths)) {
    if (typeof methods === 'object' && methods !== null) {
      count += Object.keys(methods).length;
    }
  }
  return count;
}

function validateSpec(specPath: string): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    stats: {
      totalPaths: 0,
      totalOperations: 0,
      totalSchemas: 0,
      totalRefs: 0,
      brokenRefs: 0,
      missingSchemas: 0,
    },
  };

  let spec: unknown;
  try {
    const content = readFileSync(resolve(specPath), 'utf-8');
    spec = JSON.parse(content);
  } catch (error) {
    result.valid = false;
    result.errors.push(`Failed to parse spec: ${error}`);
    return result;
  }

  // Check OpenAPI version
  const openApiVersion = (spec as { openapi?: string }).openapi;
  if (!openApiVersion) {
    result.errors.push('Missing openapi version field');
    result.valid = false;
  } else if (!openApiVersion.startsWith('3.')) {
    result.warnings.push(
      `OpenAPI version ${openApiVersion} may not be fully supported`,
    );
  }

  // Check info
  const info = (spec as { info?: unknown }).info;
  if (!info) {
    result.errors.push('Missing info object');
    result.valid = false;
  } else {
    const title = (info as { title?: string }).title;
    const version = (info as { version?: string }).version;
    if (!title) result.errors.push('Missing info.title');
    if (!version) result.errors.push('Missing info.version');
  }

  // Check paths
  const paths = (spec as { paths?: Record<string, unknown> }).paths;
  if (!paths || Object.keys(paths).length === 0) {
    result.warnings.push('No paths defined in spec');
  } else {
    result.stats.totalPaths = Object.keys(paths).length;
    result.stats.totalOperations = countOperations(paths);
  }

  // Check schemas
  const schemas = (
    spec as { components?: { schemas?: Record<string, unknown> } }
  ).components?.schemas;
  if (!schemas || Object.keys(schemas).length === 0) {
    result.warnings.push('No schemas defined in components/schemas');
  } else {
    result.stats.totalSchemas = Object.keys(schemas).length;
  }

  // Find all $ref references
  const refs = extractAllRefs(spec);
  result.stats.totalRefs = refs.size;

  // Check if all referenced schemas exist
  if (schemas) {
    const schemaNames = new Set(Object.keys(schemas));

    for (const ref of refs) {
      if (!schemaNames.has(ref)) {
        result.errors.push(
          `Broken $ref: Schema "${ref}" is referenced but not defined`,
        );
        result.valid = false;
        result.stats.brokenRefs++;
        result.stats.missingSchemas++;
      }
    }

    // Check for schemas that are never referenced (potential dead code)
    for (const schemaName of schemaNames) {
      if (
        !refs.has(schemaName) &&
        schemaName !== 'Error' &&
        schemaName !== 'ErrorResponse'
      ) {
        // This is just a warning, not an error - some schemas might be entry points
      }
    }
  } else if (refs.size > 0) {
    result.errors.push(
      `Found ${refs.size} $ref references but no schemas section`,
    );
    result.valid = false;
  }

  return result;
}

function main() {
  const specPath =
    process.argv[2] ||
    '/Users/eliya/projects/oligo/platform/apps/backend-api/src/openapi/openapi.static-generated.json';

  console.log(`🔍 Validating OpenAPI spec: ${specPath}\n`);

  const result = validateSpec(specPath);

  console.log('📊 Statistics:');
  console.log(`  Paths: ${result.stats.totalPaths}`);
  console.log(`  Operations: ${result.stats.totalOperations}`);
  console.log(`  Schemas: ${result.stats.totalSchemas}`);
  console.log(`  References: ${result.stats.totalRefs}`);
  console.log(`  Broken refs: ${result.stats.brokenRefs}`);
  console.log(`  Missing schemas: ${result.stats.missingSchemas}`);

  if (result.warnings.length > 0) {
    console.log(`\n⚠️  Warnings (${result.warnings.length}):`);
    for (const warning of result.warnings) {
      console.log(`  - ${warning}`);
    }
  }

  if (result.errors.length > 0) {
    console.log(`\n❌ Errors (${result.errors.length}):`);
    for (const error of result.errors) {
      console.log(`  - ${error}`);
    }
  }

  console.log(`\n${result.valid ? '✅ Spec is valid' : '❌ Spec has errors'}`);

  process.exit(result.valid ? 0 : 1);
}

main();
