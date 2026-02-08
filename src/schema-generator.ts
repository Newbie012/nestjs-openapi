/**
 * Schema Generator - Wraps ts-json-schema-generator with Effect
 *
 * This module generates JSON Schema definitions from TypeScript DTO files.
 */

import { Effect, Schema } from 'effect';
import {
  createGenerator,
  type Config as TsJsonSchemaConfig,
  type Schema as TsJsonSchema,
} from 'ts-json-schema-generator';
import { join, dirname } from 'node:path';
import { globSync } from 'glob';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

// Error types

export class SchemaGenerationError extends Schema.TaggedError<SchemaGenerationError>()(
  'SchemaGenerationError',
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {
  static fromError(error: unknown, context?: string): SchemaGenerationError {
    const baseMessage =
      error instanceof Error
        ? error.message
        : 'Unknown schema generation error';
    const message = context ? `${baseMessage} (${context})` : baseMessage;

    return new SchemaGenerationError({
      message,
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
  readonly type?: string | readonly string[];
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
export const generateSchemas = Effect.fn('SchemaGenerator.generate')(function* (
  options: SchemaGeneratorOptions,
) {
  yield* Effect.logDebug('Starting schema generation').pipe(
    Effect.annotateLogs({
      dtoGlob: options.dtoGlob.join(', '),
      tsconfig: options.tsconfig,
    }),
  );

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

  return { definitions: allDefinitions } as GeneratedSchemas;
});

/**
 * Generate schemas from a glob pattern
 */
const generateSchemasFromGlob = Effect.fn('SchemaGenerator.generateFromGlob')(
  function* (pattern: string, tsconfig: string, basePath: string) {
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

    yield* Effect.annotateCurrentSpan('pattern', absolutePattern);

    // Check if any files match the pattern - ts-json-schema-generator
    // doesn't handle empty patterns gracefully
    const matchedFiles = globSync(absolutePattern);
    if (matchedFiles.length === 0) {
      yield* Effect.logDebug('No files matched pattern, skipping').pipe(
        Effect.annotateLogs({ pattern: absolutePattern }),
      );
      return { definitions: {} } as GeneratedSchemas;
    }

    return yield* Effect.try({
      try: () => {
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
      catch: (error) =>
        SchemaGenerationError.fromError(error, `pattern: ${pattern}`),
    });
  },
);

/**
 * Convert ts-json-schema-generator output to our format
 */
const convertToGeneratedSchemas = (schema: TsJsonSchema): GeneratedSchemas => {
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
export const generateSchemasFromFiles = Effect.fn(
  'SchemaGenerator.generateFromFiles',
)(function* (filePaths: readonly string[], tsconfig: string) {
  if (filePaths.length === 0) {
    return { definitions: {} } as GeneratedSchemas;
  }

  yield* Effect.logDebug('Generating schemas from resolved files').pipe(
    Effect.annotateLogs({
      fileCount: filePaths.length,
    }),
  );

  const batchedResult = yield* generateSchemasWithTempTsconfig(
    filePaths,
    tsconfig,
  ).pipe(
    Effect.catchTag('SchemaGenerationError', () =>
      generateSchemasFromFilesIndividual(filePaths, tsconfig),
    ),
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
      const originalConfig = JSON.parse(readFileSync(tsconfig, 'utf-8'));

      const tempConfig = {
        ...originalConfig,
        compilerOptions: {
          ...originalConfig.compilerOptions,
          skipLibCheck: true,
          skipDefaultLibCheck: true,
          noEmit: true,
        },
        files: [...filePaths],
        // Prevent loading other files from the project
        include: undefined,
        exclude: undefined,
      };

      const tempTsconfigPath = join(
        dirname(tsconfig),
        `.tsconfig.schema-gen.${randomUUID()}.json`,
      );

      try {
        writeFileSync(tempTsconfigPath, JSON.stringify(tempConfig, null, 2));

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
    catch: (error) =>
      SchemaGenerationError.fromError(
        error,
        `files: ${filePaths.slice(0, 3).join(', ')}${filePaths.length > 3 ? ` (+${filePaths.length - 3} more)` : ''}`,
      ),
  });

/**
 * Generate schemas from files individually with error resilience.
 * Fallback when batched approach fails.
 */
const generateSchemasFromFilesIndividual = Effect.fn(
  'SchemaGenerator.generateFromFilesIndividual',
)(function* (filePaths: readonly string[], tsconfig: string) {
  const schemaResults = yield* Effect.all(
    filePaths.map((filePath) =>
      generateSchemasFromFile(filePath, tsconfig).pipe(
        // Intentional: continue even if individual files fail
        Effect.catchTag('SchemaGenerationError', () =>
          Effect.succeed({ definitions: {} } as GeneratedSchemas),
        ),
      ),
    ),
    { concurrency: 'unbounded' },
  );

  const allDefinitions = schemaResults.reduce<Record<string, JsonSchema>>(
    (acc, schemas) => ({ ...acc, ...schemas.definitions }),
    {},
  );

  return { definitions: allDefinitions } as GeneratedSchemas;
});

/**
 * Generate schemas from a single file
 */
const generateSchemasFromFile = Effect.fn('SchemaGenerator.generateFromFile')(
  function* (filePath: string, tsconfig: string) {
    return yield* Effect.try({
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
      catch: (error) =>
        SchemaGenerationError.fromError(error, `file: ${filePath}`),
    });
  },
);
