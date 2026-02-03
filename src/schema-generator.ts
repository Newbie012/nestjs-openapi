/**
 * Schema Generator - Wraps ts-json-schema-generator with Effect
 *
 * This module generates JSON Schema definitions from TypeScript DTO files.
 */

import { Effect, Data } from 'effect';
import {
  createGenerator,
  type Config as TsJsonSchemaConfig,
  type Schema,
} from 'ts-json-schema-generator';
import { join, dirname } from 'node:path';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

// Error types

export class SchemaGenerationError extends Data.TaggedError(
  'SchemaGenerationError',
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {
  static fromError(error: unknown): SchemaGenerationError {
    return new SchemaGenerationError({
      message:
        error instanceof Error
          ? error.message
          : 'Unknown schema generation error',
      cause: error,
    });
  }

  static noFilesFound(patterns: readonly string[]): SchemaGenerationError {
    return new SchemaGenerationError({
      message: `No DTO files found matching patterns: ${patterns.join(', ')}`,
    });
  }
}

export type SchemaError = SchemaGenerationError;

// Schema types

export interface GeneratedSchemas {
  readonly definitions: Record<string, JsonSchema>;
}

export interface JsonSchema {
  readonly type?: string;
  readonly format?: string;
  readonly $ref?: string;
  readonly properties?: Record<string, JsonSchema>;
  readonly required?: readonly string[];
  readonly items?: JsonSchema;
  readonly enum?: readonly unknown[];
  readonly oneOf?: readonly JsonSchema[];
  readonly anyOf?: readonly JsonSchema[];
  readonly allOf?: readonly JsonSchema[];
  readonly description?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly default?: unknown;
  readonly additionalProperties?: boolean | JsonSchema;
  readonly [key: string]: unknown;
}

// Options

export interface SchemaGeneratorOptions {
  /** Glob patterns for DTO files */
  readonly dtoGlob: readonly string[];
  /** Path to tsconfig.json */
  readonly tsconfig: string;
  /** Base directory for resolving globs */
  readonly basePath: string;
}

/**
 * Generate JSON Schema definitions from TypeScript DTO files
 */
export const generateSchemas = (
  options: SchemaGeneratorOptions,
): Effect.Effect<GeneratedSchemas, SchemaError> =>
  Effect.gen(function* () {
    yield* Effect.logDebug('Starting schema generation').pipe(
      Effect.annotateLogs({
        dtoGlob: options.dtoGlob.join(', '),
        tsconfig: options.tsconfig,
      }),
    );

    // Group patterns: combine src-local patterns, keep external patterns separate
    const patterns = options.dtoGlob.map((pattern) => ({
      pattern,
      combinable: !pattern.startsWith('/') && !pattern.includes('..'),
    }));

    const combinable = patterns.filter((p) => p.combinable);
    const nonCombinable = patterns.filter((p) => !p.combinable);

    const groupedPatterns: string[] = [];
    if (combinable.length > 0) {
      groupedPatterns.push(
        combinable.length === 1
          ? combinable[0]!.pattern
          : `{${combinable.map((p) => p.pattern).join(',')}}`,
      );
    }
    groupedPatterns.push(...nonCombinable.map((p) => p.pattern));

    // Generate schemas for all pattern groups in parallel
    const schemaResults = yield* Effect.all(
      groupedPatterns.map((pattern) =>
        generateSchemasFromGlob(pattern, options.tsconfig, options.basePath),
      ),
      { concurrency: 'unbounded' },
    );

    const allDefinitions = schemaResults.reduce<Record<string, JsonSchema>>(
      (acc, schemas) => ({ ...acc, ...schemas.definitions }),
      {},
    );

    yield* Effect.logDebug('Schema generation complete').pipe(
      Effect.annotateLogs({
        definitionCount: Object.keys(allDefinitions).length,
      }),
    );

    return { definitions: allDefinitions };
  });

/**
 * Generate schemas from a glob pattern
 */
const generateSchemasFromGlob = (
  pattern: string,
  tsconfig: string,
  basePath: string,
): Effect.Effect<GeneratedSchemas, SchemaError> =>
  Effect.try({
    try: () => {
      // Resolve the pattern relative to basePath. Brace patterns may include
      // multiple absolute paths, so we detect that case and skip joining.
      const isBraceAbsolute =
        pattern.startsWith('{') &&
        pattern
          .slice(1, -1)
          .split(',')
          .map((entry) => entry.trim())
          .every((entry) => entry.startsWith('/'));

      const absolutePattern =
        pattern.startsWith('/') || isBraceAbsolute
          ? pattern
          : join(basePath, pattern);

      const config: TsJsonSchemaConfig = {
        path: absolutePattern,
        tsconfig,
        type: '*', // Generate schemas for all exported types
        skipTypeCheck: true,
        // Note: topRef must NOT be set to false, as it prevents interface schemas from being generated
        expose: 'export', // Only export explicitly exported types
        jsDoc: 'extended', // Include JSDoc comments
        sortProps: true,
        strictTuples: false,
        encodeRefs: false,
        additionalProperties: false,
      };

      const generator = createGenerator(config);
      const schema = generator.createSchema(config.type);

      return convertToGeneratedSchemas(schema);
    },
    catch: SchemaGenerationError.fromError,
  });

/**
 * Convert ts-json-schema-generator output to our format
 */
const convertToGeneratedSchemas = (schema: Schema): GeneratedSchemas => {
  const definitions: Record<string, JsonSchema> = {};

  // ts-json-schema-generator puts definitions under $defs or definitions
  const defs =
    (schema.$defs as Record<string, JsonSchema>) ??
    (schema.definitions as Record<string, JsonSchema>) ??
    {};

  for (const [name, def] of Object.entries(defs)) {
    definitions[name] = def as JsonSchema;
  }

  return { definitions };
};

/**
 * Generate schemas from a specific list of file paths.
 * This is used for the hybrid approach to generate schemas for
 * types that weren't covered by the initial dtoGlob patterns.
 *
 * Uses a temporary tsconfig with only the specified files for better performance.
 * Falls back to individual file processing if the batched approach fails.
 */
export const generateSchemasFromFiles = (
  filePaths: readonly string[],
  tsconfig: string,
): Effect.Effect<GeneratedSchemas, SchemaError> =>
  Effect.gen(function* () {
    if (filePaths.length === 0) {
      return { definitions: {} };
    }

    yield* Effect.logDebug('Generating schemas from resolved files').pipe(
      Effect.annotateLogs({
        fileCount: filePaths.length,
      }),
    );

    // Try batched approach with temporary tsconfig (much faster)
    const batchedResult = yield* generateSchemasWithTempTsconfig(
      filePaths,
      tsconfig,
    ).pipe(
      Effect.catchAll(() => {
        // Batch failed, fall back to individual files with error resilience
        return generateSchemasFromFilesIndividual(filePaths, tsconfig);
      }),
    );

    yield* Effect.logDebug('Additional schema generation complete').pipe(
      Effect.annotateLogs({
        definitionCount: Object.keys(batchedResult.definitions).length,
      }),
    );

    return batchedResult;
  });

/**
 * Generate schemas using a temporary tsconfig that only includes the specified files.
 * This avoids loading the entire project and is much faster.
 */
const generateSchemasWithTempTsconfig = (
  filePaths: readonly string[],
  tsconfig: string,
): Effect.Effect<GeneratedSchemas, SchemaError> =>
  Effect.try({
    try: () => {
      // Read the original tsconfig
      const originalConfig = JSON.parse(readFileSync(tsconfig, 'utf-8'));

      // Create a minimal tsconfig that only includes the specified files
      const tempConfig = {
        ...originalConfig,
        compilerOptions: {
          ...originalConfig.compilerOptions,
          skipLibCheck: true,
          skipDefaultLibCheck: true,
          noEmit: true,
        },
        // Only include the files we need
        files: [...filePaths],
        // Remove include/exclude to prevent loading other files
        include: undefined,
        exclude: undefined,
      };

      // Write to a temporary file
      const tempTsconfigPath = join(
        dirname(tsconfig),
        `.tsconfig.schema-gen.${randomUUID()}.json`,
      );

      try {
        writeFileSync(tempTsconfigPath, JSON.stringify(tempConfig, null, 2));

        // Create brace pattern for all files
        const pattern =
          filePaths.length === 1 ? filePaths[0]! : `{${filePaths.join(',')}}`;

        const config: TsJsonSchemaConfig = {
          path: pattern,
          tsconfig: tempTsconfigPath,
          type: '*',
          skipTypeCheck: true,
          expose: 'export',
          jsDoc: 'extended',
          sortProps: true,
          strictTuples: false,
          encodeRefs: false,
          additionalProperties: false,
        };

        const generator = createGenerator(config);
        const schema = generator.createSchema(config.type);

        return convertToGeneratedSchemas(schema);
      } finally {
        // Clean up temporary file
        if (existsSync(tempTsconfigPath)) {
          unlinkSync(tempTsconfigPath);
        }
      }
    },
    catch: SchemaGenerationError.fromError,
  });

/**
 * Generate schemas from files individually with error resilience.
 * Fallback when batched approach fails.
 */
const generateSchemasFromFilesIndividual = (
  filePaths: readonly string[],
  tsconfig: string,
): Effect.Effect<GeneratedSchemas, never> =>
  Effect.gen(function* () {
    const schemaResults = yield* Effect.all(
      filePaths.map((filePath) =>
        generateSchemasFromFile(filePath, tsconfig).pipe(
          // On error, return empty definitions instead of failing
          Effect.catchAll(() => Effect.succeed({ definitions: {} })),
        ),
      ),
      { concurrency: 'unbounded' },
    );

    const allDefinitions = schemaResults.reduce<Record<string, JsonSchema>>(
      (acc, schemas) => ({ ...acc, ...schemas.definitions }),
      {},
    );

    return { definitions: allDefinitions };
  });

/**
 * Generate schemas from a single file
 */
const generateSchemasFromFile = (
  filePath: string,
  tsconfig: string,
): Effect.Effect<GeneratedSchemas, SchemaError> =>
  Effect.try({
    try: () => {
      const config: TsJsonSchemaConfig = {
        path: filePath,
        tsconfig,
        type: '*',
        skipTypeCheck: true,
        expose: 'export',
        jsDoc: 'extended',
        sortProps: true,
        strictTuples: false,
        encodeRefs: false,
        additionalProperties: false,
      };

      const generator = createGenerator(config);
      const schema = generator.createSchema(config.type);

      return convertToGeneratedSchemas(schema);
    },
    catch: (error) => SchemaGenerationError.fromError(error),
  });
