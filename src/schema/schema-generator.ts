/**
 * Schema Generator - Wraps ts-json-schema-generator with Effect
 *
 * This module generates JSON Schema definitions from TypeScript DTO files.
 */

import { Effect } from 'effect';
import type { Schema as TsJsonSchema } from 'ts-json-schema-generator';
import { join, resolve as resolvePath } from 'node:path';
import { globSync } from 'glob';
import type * as TypeScript from 'typescript';
import { identifierPattern } from '../analysis/ast.js';
import { SchemaGenerationError } from '../config/errors.js';
import {
  createSchemaGenerator,
  createSchemaGeneratorForProgram,
  eraseFailingPropertyType,
  findPropertyTypePositions,
  readProgramSource,
  type SchemaGeneratorHandle,
  type SchemaProgramOptions,
} from './schema-program.js';

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

const toSortedUniquePaths = (filePaths: readonly string[]): readonly string[] =>
  [...new Set(filePaths.map((filePath) => resolvePath(filePath)))].sort();

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

    const generator = reuseProgram
      ? createSchemaGeneratorForProgram(reuseProgram as TypeScript.Program)
      : yield* createSchemaGenerator({ tsconfig, rootFiles: matchedFiles });

    return yield* Effect.try({
      try: () => convertToGeneratedSchemas(generator.createSchema('*')),
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

type TypeTarget = {
  readonly filePath: string;
  readonly name: string;
};

type Failure = { readonly target: TypeTarget; readonly error: unknown };

type IsolatedProperty = {
  readonly typeName: string;
  readonly property: string;
  readonly filePath: string;
  readonly reason: string;
};

// Strips the suffix schema identity gives renamed declarations
const publicTypeName = (name: string) => name.replace(/__oapi\d+/g, '');

const trySchemaForNodes = (
  handle: SchemaGeneratorHandle,
  nodes: readonly TypeScript.Node[],
) =>
  Effect.either(
    Effect.try({
      try: () => convertToGeneratedSchemas(handle.createSchemaForNodes(nodes)),
      catch: (error) => error,
    }),
  );

const findErrorPosition = (error: unknown) => {
  let current: unknown = error;
  while (current && typeof current === 'object') {
    const diagnostic = (current as { diagnostic?: unknown }).diagnostic as
      | { file?: { fileName?: string }; start?: number }
      | undefined;
    if (diagnostic?.file?.fileName && typeof diagnostic.start === 'number') {
      return { fileName: diagnostic.file.fileName, start: diagnostic.start };
    }
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
};

const describeError = (error: unknown) => {
  const messages: string[] = [];
  let current: unknown = error;
  let location: string | undefined;
  while (current && typeof current === 'object') {
    const message = (current as { message?: unknown }).message;
    if (typeof message === 'string')
      messages.push(message.split('\n')[0]!.trim());
    const diagnostic = (current as { diagnostic?: unknown }).diagnostic as
      | { file?: TypeScript.SourceFile; start?: number }
      | undefined;
    if (!location && diagnostic?.file && typeof diagnostic.start === 'number') {
      const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(
        diagnostic.start,
      );
      location = `${diagnostic.file.fileName}:${line + 1}:${character + 1}`;
    }
    current = (current as { cause?: unknown }).cause;
  }
  const reason =
    publicTypeName([...new Set(messages)].join(': ')) || 'unknown error';
  return location ? `${reason} (at ${location})` : reason;
};

const MAX_ISOLATED_PROPERTIES = 5;
const MAX_SCANNED_PROPERTIES = 40;

type Recovered = {
  readonly definitions: Record<string, JsonSchema>;
  readonly isolated: readonly IsolatedProperty[];
  readonly options: SchemaProgramOptions;
};

const generateTypeIn = (options: SchemaProgramOptions, target: TypeTarget) =>
  Effect.gen(function* () {
    const handle = yield* createSchemaGenerator(options);
    const node = handle.findType(target.filePath, target.name);
    if (!node) {
      return yield* Effect.fail(
        new SchemaGenerationError({
          message: `Type ${publicTypeName(target.name)} not found in ${target.filePath}`,
        }),
      );
    }
    const result = yield* trySchemaForNodes(handle, [node]);
    if (result._tag === 'Left') return yield* Effect.fail(result.left);
    return result.right.definitions;
  });

const withVirtualFile = (
  options: SchemaProgramOptions,
  filePath: string,
  text: string,
): SchemaProgramOptions => ({
  ...options,
  virtualFiles: new Map([
    ...(options.virtualFiles ?? new Map<string, string>()),
    [filePath, text],
  ]),
});

// For errors without a source position: the failing node was synthesized,
// as for `z.infer<typeof schema>`
const recoverByScanningProperties = (
  options: SchemaProgramOptions,
  target: TypeTarget,
  error: unknown,
): Effect.Effect<Recovered | undefined> =>
  Effect.gen(function* () {
    const text = readProgramSource(target.filePath, options);
    if (text === undefined) return undefined;
    const positions = findPropertyTypePositions(
      target.filePath,
      text,
      target.name,
    );
    if (positions.length === 0 || positions.length > MAX_SCANNED_PROPERTIES) {
      return undefined;
    }

    const attempt = (erasedPositions: readonly number[]) =>
      Effect.gen(function* () {
        let edited = text;
        const properties: string[] = [];
        // Last position first, so earlier positions stay valid
        for (const position of [...erasedPositions].sort((a, b) => b - a)) {
          const erased = eraseFailingPropertyType(
            target.filePath,
            edited,
            position,
          );
          if (!erased) return undefined;
          edited = erased.text;
          properties.unshift(erased.property);
        }
        const editedOptions = withVirtualFile(options, target.filePath, edited);
        const result = yield* Effect.either(
          generateTypeIn(editedOptions, target),
        );
        return result._tag === 'Right'
          ? {
              definitions: result.right,
              options: editedOptions,
              isolated: properties.map((property) => ({
                typeName: target.name,
                property,
                filePath: target.filePath,
                reason: describeError(error),
              })),
            }
          : undefined;
      });

    for (const position of positions) {
      const single = yield* attempt([position]);
      if (single) return single;
    }
    for (let count = 2; count <= positions.length; count++) {
      const cumulative = yield* attempt(positions.slice(0, count));
      if (cumulative) return cumulative;
    }
    return undefined;
  });

const inlineExternalTypesIn = (
  options: SchemaProgramOptions,
  target: TypeTarget,
) =>
  Effect.map(Effect.either(createSchemaGenerator(options)), (handle) =>
    handle._tag === 'Right'
      ? handle.right.inlineExternalTypes(target.filePath, target.name)
      : undefined,
  );

// A failure inside library typings cannot be pinned on one property, so
// before giving up the library types the declaration references are inlined
const nextRecoveryEdit = (
  options: SchemaProgramOptions,
  target: TypeTarget,
  error: unknown,
  position: { readonly fileName: string; readonly start: number },
  inlined: boolean,
) =>
  Effect.gen(function* () {
    const filePath = resolvePath(position.fileName);
    const text = readProgramSource(filePath, options);
    const erased =
      text === undefined
        ? undefined
        : eraseFailingPropertyType(filePath, text, position.start);
    if (erased) {
      return {
        options: withVirtualFile(options, filePath, erased.text),
        isolated: {
          typeName: target.name,
          property: erased.property,
          filePath,
          reason: describeError(error),
        },
      };
    }
    if (inlined) return undefined;
    const inlinedText = yield* inlineExternalTypesIn(options, target);
    if (inlinedText === undefined) return undefined;
    return {
      options: withVirtualFile(
        options,
        resolvePath(target.filePath),
        inlinedText,
      ),
      isolated: undefined,
    };
  });

const recoverFailedType = (
  options: SchemaProgramOptions,
  target: TypeTarget,
  initialError: unknown,
): Effect.Effect<Recovered | undefined> =>
  Effect.gen(function* () {
    let current = options;
    let error = initialError;
    let inlined = false;
    const isolated: IsolatedProperty[] = [];

    for (let attempt = 0; attempt < MAX_ISOLATED_PROPERTIES; attempt++) {
      const position = findErrorPosition(error);
      if (!position) {
        if (isolated.length === 0) {
          const scanned = yield* recoverByScanningProperties(
            current,
            target,
            error,
          );
          if (scanned) return scanned;
        }
        break;
      }
      const edit = yield* nextRecoveryEdit(
        current,
        target,
        error,
        position,
        inlined,
      );
      if (!edit) break;

      if (edit.isolated) isolated.push(edit.isolated);
      else inlined = true;
      current = edit.options;
      const result = yield* Effect.either(generateTypeIn(current, target));
      if (result._tag === 'Right') {
        return { definitions: result.right, isolated, options: current };
      }
      error = result.left;
    }

    // Last resort: without the class's `extends` clauses (for this type only)
    const withoutHeritage = yield* Effect.either(
      generateTypeIn(
        {
          ...options,
          stripHeritageIn: new Set([
            ...(options.stripHeritageIn ?? []),
            resolvePath(target.filePath),
          ]),
        },
        target,
      ),
    );
    return withoutHeritage._tag === 'Right'
      ? { definitions: withoutHeritage.right, isolated: [], options }
      : undefined;
  });

const generateInProgram = (
  options: SchemaProgramOptions,
  targets: 'all' | readonly TypeTarget[],
): Effect.Effect<GeneratedSchemas, SchemaError> =>
  Effect.gen(function* () {
    const handle = yield* createSchemaGenerator(options);

    const missing: TypeTarget[] = [];
    const roots =
      targets === 'all'
        ? handle.rootTypes()
        : targets.flatMap((target) => {
            const node = handle.findType(target.filePath, target.name);
            if (!node) {
              missing.push(target);
              return [];
            }
            return [{ ...target, node }];
          });
    if (roots.length === 0) return { definitions: {} } as GeneratedSchemas;

    const whole = yield* trySchemaForNodes(
      handle,
      roots.map((root) => root.node),
    );
    if (whole._tag === 'Right') {
      return targets === 'all'
        ? whole.right
        : nameRequestedTypes(whole.right, roots, handle);
    }

    const definitions: Record<string, JsonSchema> = {};
    const failed: Failure[] = [];
    for (const root of roots) {
      const single = yield* trySchemaForNodes(handle, [root.node]);
      if (single._tag === 'Right') {
        Object.assign(definitions, single.right.definitions);
      } else {
        failed.push({ target: root, error: single.left });
      }
    }

    // A type that fails often only references one that does: recover the
    // types in dependency order and share the edits, so dependents generate
    // untouched once what they reference does. Each round retries every
    // pending type in one program built with the edits so far.
    const isolated: IsolatedProperty[] = [];
    const unrecovered: Failure[] = [];
    let shared = options;
    let pending: readonly Failure[] = failed;
    let edited = false;
    while (pending.length > 0) {
      if (edited) {
        const retried = yield* retryInProgram(
          shared,
          pending.map(({ target }) => target),
        );
        Object.assign(definitions, retried.definitions);
        pending = retried.failed;
        if (pending.length === 0) break;
      }

      const pendingNames = new Set(pending.map(({ target }) => target.name));
      const next =
        pending.find(
          ({ target }) => !referencesAnyOf(shared, target, pendingNames),
        ) ?? pending[0]!;
      pending = pending.filter((entry) => entry !== next);

      const recovered = yield* recoverFailedType(
        shared,
        next.target,
        next.error,
      );
      if (recovered) {
        Object.assign(definitions, recovered.definitions);
        isolated.push(...recovered.isolated);
        edited = recovered.options !== shared;
        shared = recovered.options;
      } else {
        unrecovered.push(next);
        edited = false;
      }
    }

    yield* warnIsolatedProperties(isolated);
    // An empty schema keeps references valid
    for (const { target } of unrecovered) definitions[target.name] = {};
    yield* Effect.forEach(unrecovered, ({ target, error }) =>
      Effect.logWarning(
        `Could not generate a schema for ${publicTypeName(target.name)}; it is documented as any value`,
      ).pipe(
        Effect.annotateLogs({
          filePath: target.filePath,
          reason: describeError(error),
        }),
      ),
    );
    if (missing.length > 0) {
      yield* Effect.logDebug('Types not found in their files').pipe(
        Effect.annotateLogs({
          types: missing
            .map((target) => publicTypeName(target.name))
            .join(', '),
        }),
      );
    }

    return { definitions } as GeneratedSchemas;
  });

// The generator only names exported types: a non-exported interface
// requested by name gets a `def-interface-...` key instead
const nameRequestedTypes = (
  schemas: GeneratedSchemas,
  roots: readonly (TypeTarget & { readonly node: TypeScript.Node })[],
  handle: SchemaGeneratorHandle,
) => {
  const definitions = { ...schemas.definitions };
  for (const root of roots) {
    if (definitions[root.name]) continue;
    let single: (TsJsonSchema & { $ref?: string }) | undefined;
    try {
      single = handle.createSchemaForNodes([root.node]);
    } catch {
      continue;
    }
    const rootKey = single?.$ref?.replace(/^#\/definitions\//, '');
    const rootSchema = rootKey
      ? (single?.definitions as Record<string, JsonSchema> | undefined)?.[
          rootKey
        ]
      : undefined;
    if (rootSchema) definitions[root.name] = rootSchema;
  }
  return { definitions };
};

const retryInProgram = (
  options: SchemaProgramOptions,
  targets: readonly TypeTarget[],
) =>
  Effect.gen(function* () {
    const definitions: Record<string, JsonSchema> = {};
    const failed: Failure[] = [];
    const handle = yield* Effect.either(createSchemaGenerator(options));
    if (handle._tag === 'Left') {
      return {
        definitions,
        failed: targets.map((target) => ({ target, error: handle.left })),
      };
    }
    for (const target of targets) {
      const node = handle.right.findType(target.filePath, target.name);
      const result = node
        ? yield* trySchemaForNodes(handle.right, [node])
        : undefined;
      if (result?._tag === 'Right')
        Object.assign(definitions, result.right.definitions);
      else
        failed.push({
          target,
          error: result?._tag === 'Left' ? result.left : undefined,
        });
    }
    return { definitions, failed };
  });

const referencesAnyOf = (
  options: SchemaProgramOptions,
  target: TypeTarget,
  names: ReadonlySet<string>,
) => {
  const text = readProgramSource(target.filePath, options);
  if (text === undefined) return false;
  const typeTexts = findPropertyTypePositions(
    target.filePath,
    text,
    target.name,
  ).map((position) => text.slice(position, text.indexOf(';', position) >>> 0));
  return [...names].some(
    (name) =>
      name !== target.name &&
      typeTexts.some((typeText) => identifierPattern(name).test(typeText)),
  );
};

const warnIsolatedProperties = (isolated: readonly IsolatedProperty[]) =>
  Effect.forEach(isolated, (entry) =>
    Effect.logWarning(
      `Generated ${publicTypeName(entry.typeName)} without the type of its "${entry.property}" property, which the schema generator cannot handle`,
    ).pipe(
      Effect.annotateLogs({ filePath: entry.filePath, reason: entry.reason }),
    ),
  );

/**
 * Generate schemas for every exported type of the given files.
 */
export const generateSchemasFromFiles = Effect.fn(
  'SchemaGenerator.generateFromFiles',
)(function* (filePaths: readonly string[], tsconfig: string) {
  const rootFiles = toSortedUniquePaths(filePaths);
  if (rootFiles.length === 0) return { definitions: {} } as GeneratedSchemas;
  return yield* generateInProgram({ tsconfig, rootFiles }, 'all');
});

export const generateNamedSchemas = Effect.fn(
  'SchemaGenerator.generateNamedSchemas',
)(function* (
  locations: ReadonlyMap<string, string>,
  tsconfig: string,
  virtualFiles?: ReadonlyMap<string, string>,
) {
  const targets = [...locations].map(([name, filePath]) => ({
    name,
    filePath: resolvePath(filePath),
  }));
  if (targets.length === 0) return { definitions: {} } as GeneratedSchemas;
  return yield* generateInProgram(
    {
      tsconfig,
      rootFiles: toSortedUniquePaths(targets.map((target) => target.filePath)),
      virtualFiles,
    },
    targets,
  );
});

export const generateSchemasFromVirtualFile = Effect.fn(
  'SchemaGenerator.generateFromVirtualFile',
)(function* (
  filePath: string,
  content: string,
  tsconfig: string,
  overlay?: ReadonlyMap<string, string>,
) {
  return yield* generateInProgram(
    {
      tsconfig,
      rootFiles: [filePath],
      virtualFiles: new Map([
        ...(overlay ?? new Map<string, string>()),
        [resolvePath(filePath), content],
      ]),
    },
    'all',
  );
});
