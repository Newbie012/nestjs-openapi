/**
 * Schema Generator - Wraps ts-json-schema-generator with Effect
 *
 * This module generates JSON Schema definitions from TypeScript DTO files.
 */

import { Effect } from 'effect';
import {
  createGenerator,
  type Config as TsJsonSchemaConfig,
  type Schema as TsJsonSchema,
} from 'ts-json-schema-generator';
import { ts } from 'ts-morph';
import { join, dirname, resolve as resolvePath, basename } from 'node:path';
import { globSync } from 'glob';
import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  existsSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { SchemaGenerationError } from './errors.js';

// Error types

export type SchemaError = SchemaGenerationError;
export { SchemaGenerationError };

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
  /** Optional shared TypeScript program to reuse compiler context */
  readonly reuseProgram?: unknown;
}

const MAX_SCHEMA_FILES_PER_BATCH = 16;

const chunkArray = <T>(items: readonly T[], chunkSize: number): T[][] => {
  if (items.length === 0) return [];
  if (items.length <= chunkSize) return [[...items]];

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
};

const toSortedUniquePaths = (filePaths: readonly string[]): readonly string[] =>
  [...new Set(filePaths)].sort();

const extractDiagnosticFilePathFromCause = (
  cause: unknown,
): string | undefined => {
  if (!cause || typeof cause !== 'object') {
    return undefined;
  }

  if ('diagnostic' in cause && cause.diagnostic && typeof cause.diagnostic === 'object') {
    const diagnostic = cause.diagnostic as {
      readonly file?: { readonly fileName?: unknown };
    };
    if (
      diagnostic.file &&
      typeof diagnostic.file === 'object' &&
      typeof diagnostic.file.fileName === 'string'
    ) {
      return diagnostic.file.fileName;
    }
  }

  if ('cause' in cause) {
    return extractDiagnosticFilePathFromCause(
      (cause as { readonly cause?: unknown }).cause,
    );
  }

  return undefined;
};

const resolveFailedBatchFilePath = (
  error: SchemaGenerationError,
  filePaths: readonly string[],
): string | undefined => {
  const diagnosticPath = extractDiagnosticFilePathFromCause(error.cause);
  if (!diagnosticPath) {
    return undefined;
  }

  const normalizedDiagnosticPath = resolvePath(diagnosticPath);
  for (const filePath of filePaths) {
    if (resolvePath(filePath) === normalizedDiagnosticPath) {
      return filePath;
    }
  }

  const diagnosticFileName = basename(normalizedDiagnosticPath);
  return filePaths.find((filePath) => basename(filePath) === diagnosticFileName);
};

const createSchemaGenerator = (
  config: TsJsonSchemaConfig,
  reuseProgram?: unknown,
): { createSchema: (type: string) => TsJsonSchema } => {
  if (!reuseProgram) {
    return createGenerator(config);
  }

  const require = createRequire(import.meta.url);
  const tsj = require('ts-json-schema-generator') as {
    createParser: (program: unknown, config: unknown) => unknown;
    createFormatter: (config: unknown) => unknown;
    DEFAULT_CONFIG: Record<string, unknown>;
    SchemaGenerator: new (
      program: unknown,
      parser: unknown,
      formatter: unknown,
      config: unknown,
    ) => { createSchema: (type: string) => TsJsonSchema };
  };

  const completedConfig = { ...tsj.DEFAULT_CONFIG, ...config };
  const parser = tsj.createParser(reuseProgram, completedConfig);
  const formatter = tsj.createFormatter(completedConfig);
  return new tsj.SchemaGenerator(
    reuseProgram,
    parser,
    formatter,
    completedConfig,
  );
};

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

  if (options.reuseProgram) {
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
        generateSchemasFromGlob(
          pattern,
          options.tsconfig,
          options.basePath,
          options.reuseProgram,
        ),
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
  }

  const absolutePatterns = options.dtoGlob.map((pattern) =>
    pattern.startsWith('/') ? pattern : join(options.basePath, pattern),
  );

  const matchedFiles = [
    ...new Set(absolutePatterns.flatMap((pattern) => globSync(pattern))),
  ];

  if (matchedFiles.length === 0) {
    yield* Effect.logDebug('No DTO files matched patterns, skipping').pipe(
      Effect.annotateLogs({
        patternCount: absolutePatterns.length,
      }),
    );
    return { definitions: {} } as GeneratedSchemas;
  }

  const batchedSchemas = yield* generateSchemasFromFiles(
    matchedFiles,
    options.tsconfig,
  );
  const allDefinitions = { ...batchedSchemas.definitions };

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
  function* (
    pattern: string,
    tsconfig: string,
    basePath: string,
    reuseProgram?: unknown,
  ) {
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

        const generator = createSchemaGenerator(config, reuseProgram);
        const schema = generator.createSchema(config.type ?? '*');

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
  const uniqueFilePaths = toSortedUniquePaths(filePaths);

  if (uniqueFilePaths.length === 0) {
    return { definitions: {} } as GeneratedSchemas;
  }

  yield* Effect.logDebug('Generating schemas from resolved files').pipe(
    Effect.annotateLogs({
      fileCount: uniqueFilePaths.length,
    }),
  );

  const batches = chunkArray(uniqueFilePaths, MAX_SCHEMA_FILES_PER_BATCH);

  const batchResults = yield* Effect.forEach(batches, (batch) =>
    generateSchemasFromFilesBatchWithFallback(batch, tsconfig),
  );

  const batchedResult = {
    definitions: batchResults.reduce<Record<string, JsonSchema>>(
      (acc, schemas) => ({ ...acc, ...schemas.definitions }),
      {},
    ),
  } as GeneratedSchemas;

  yield* Effect.logDebug('Additional schema generation complete').pipe(
    Effect.annotateLogs({
      definitionCount: Object.keys(batchedResult.definitions).length,
    }),
  );

  return batchedResult;
});

const generateSchemasFromFilesBatchWithFallback = (
  filePaths: readonly string[],
  tsconfig: string,
): Effect.Effect<GeneratedSchemas, never, never> =>
  Effect.gen(function* () {
  const directBatch = yield* generateSchemasWithTempTsconfig(
    filePaths,
    tsconfig,
  ).pipe(Effect.either);

  if (directBatch._tag === 'Right') {
    return directBatch.right;
  }

  const failedBatch = directBatch.left;
  const failedFilePath = resolveFailedBatchFilePath(failedBatch, filePaths);

  if (failedFilePath && filePaths.length > 1) {
    yield* Effect.logDebug('Schema batch failed, isolating problematic file').pipe(
      Effect.annotateLogs({
        fileCount: filePaths.length,
        filePath: failedFilePath,
      }),
    );

    const remainingFilePaths = filePaths.filter(
      (filePath) => filePath !== failedFilePath,
    );

    const [remainingSchemas, failedFileSchemas]: readonly [
      GeneratedSchemas,
      GeneratedSchemas,
    ] = yield* Effect.all(
      [
        remainingFilePaths.length > 0
          ? generateSchemasFromFilesBatchWithFallback(
              remainingFilePaths,
              tsconfig,
            )
          : Effect.succeed({ definitions: {} } as GeneratedSchemas),
        generateSchemasFromFilesIndividual([failedFilePath], tsconfig),
      ],
      { concurrency: 2 },
    );

    return {
      definitions: {
        ...remainingSchemas.definitions,
        ...failedFileSchemas.definitions,
      },
    } as GeneratedSchemas;
  }

  yield* Effect.logDebug('Schema batch failed, splitting fallback').pipe(
    Effect.annotateLogs({
      fileCount: filePaths.length,
    }),
  );

  if (filePaths.length <= 1) {
    return yield* generateSchemasFromFilesIndividual(filePaths, tsconfig);
  }

  const middle = Math.ceil(filePaths.length / 2);
  const left = filePaths.slice(0, middle);
  const right = filePaths.slice(middle);

  const [leftSchemas, rightSchemas]: readonly [GeneratedSchemas, GeneratedSchemas] =
    yield* Effect.all(
      [
        generateSchemasFromFilesBatchWithFallback(left, tsconfig),
        generateSchemasFromFilesBatchWithFallback(right, tsconfig),
      ],
      { concurrency: 2 },
    );

  return {
    definitions: {
      ...leftSchemas.definitions,
      ...rightSchemas.definitions,
    },
  } as GeneratedSchemas;
});

/**
 * Generate schemas using a temporary tsconfig that only includes the specified files.
 * This avoids loading the entire project and is much faster.
 */
const generateSchemasWithTempTsconfig = (
  filePaths: readonly string[],
  tsconfig: string,
): Effect.Effect<GeneratedSchemas, SchemaError> =>
  Effect.gen(function* () {
    const context = `files: ${filePaths.slice(0, 3).join(', ')}${
      filePaths.length > 3 ? ` (+${filePaths.length - 3} more)` : ''
    }`;

    const rawConfig = yield* Effect.try({
      try: () => readFileSync(tsconfig, 'utf-8'),
      catch: (error) => SchemaGenerationError.fromError(error, context),
    });

    const parsed = ts.parseConfigFileTextToJson(tsconfig, rawConfig);
    if (!parsed.config || parsed.error) {
      const message = parsed.error
        ? ts.flattenDiagnosticMessageText(parsed.error.messageText, '\n')
        : 'Failed to parse tsconfig';
      return yield* Effect.fail(
        new SchemaGenerationError({
          message: `${message} (${context})`,
        }),
      );
    }

    const originalConfig = parsed.config as Record<string, unknown>;
    const originalCompilerOptions =
      typeof originalConfig.compilerOptions === 'object' &&
      originalConfig.compilerOptions
        ? (originalConfig.compilerOptions as Record<string, unknown>)
        : {};

    const tempConfig = {
      ...originalConfig,
      compilerOptions: {
        ...originalCompilerOptions,
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

    return yield* Effect.try({
      try: () => {
        try {
          writeFileSync(tempTsconfigPath, JSON.stringify(tempConfig, null, 2));
          const pattern =
            filePaths.length === 1
              ? filePaths[0]!
              : `{${filePaths.join(',')}}`;

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
      catch: (error) => SchemaGenerationError.fromError(error, context),
    });
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
    const generateFromPath = (
      path: string,
      context: string,
    ): Effect.Effect<GeneratedSchemas, SchemaError> =>
      Effect.try({
        try: () => {
          const config: TsJsonSchemaConfig = {
            path,
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
          SchemaGenerationError.fromError(error, context),
      });

    return yield* generateFromPath(filePath, `file: ${filePath}`).pipe(
      Effect.catchTag('SchemaGenerationError', (originalError) =>
        generateSchemasFromSanitizedFile(filePath, tsconfig).pipe(
          Effect.catchTag('SchemaGenerationError', () =>
            Effect.fail(originalError),
          ),
        ),
      ),
    );
  },
);

const stripClassHeritageClauses = (source: string, filePath: string): string => {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const ranges: Array<readonly [start: number, end: number]> = [];

  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) && node.heritageClauses) {
      for (const clause of node.heritageClauses) {
        ranges.push([clause.pos, clause.end] as const);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  if (ranges.length === 0) {
    return source;
  }

  let sanitized = source;
  for (const [start, end] of ranges.sort((a, b) => b[0] - a[0])) {
    sanitized = `${sanitized.slice(0, start)}${sanitized.slice(end)}`;
  }

  return sanitized;
};

const generateSchemasFromSanitizedFile = (
  filePath: string,
  tsconfig: string,
): Effect.Effect<GeneratedSchemas, SchemaError> =>
  Effect.gen(function* () {
    const context = `file (sanitized): ${filePath}`;
    const originalSource = yield* Effect.try({
      try: () => readFileSync(filePath, 'utf-8'),
      catch: (error) => SchemaGenerationError.fromError(error, context),
    });
    const sanitizedSource = stripClassHeritageClauses(originalSource, filePath);

    if (sanitizedSource === originalSource) {
      return yield* Effect.fail(
        new SchemaGenerationError({
          message: `No class heritage clauses to sanitize (${context})`,
        }),
      );
    }

    const tempSanitizedPath = join(
      dirname(filePath),
      `.schema-sanitized.${randomUUID()}.ts`,
    );

    return yield* Effect.try({
      try: () => {
        try {
          writeFileSync(tempSanitizedPath, sanitizedSource, 'utf-8');

          const config: TsJsonSchemaConfig = {
            path: tempSanitizedPath,
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
        } finally {
          if (existsSync(tempSanitizedPath)) {
            unlinkSync(tempSanitizedPath);
          }
        }
      },
      catch: (error) => SchemaGenerationError.fromError(error, context),
    });
  });