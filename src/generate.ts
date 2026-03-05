/**
 * Promise-based entry point for generating OpenAPI specifications.
 *
 * This module provides a clean, Promise-based API that hides the internal
 * Effect-TS implementation from consumers.
 */

import { Effect } from 'effect';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Project } from 'ts-morph';
import { glob as nodeGlob } from 'glob';
import type {
  GenerateOverrides,
  OpenApiSpec,
  OpenApiSchema,
  SecurityRequirement,
  OpenApiPaths,
} from './types.js';
import { buildSecuritySchemes } from './security.js';
import {
  EntryNotFoundError,
  ConfigValidationError,
  DtoGlobResolutionError,
  MissingGenericSchemaTempFileCleanupError,
  MissingGenericSchemaTempFileWriteError,
  type GeneratorError,
} from './errors.js';
import { ModuleTraversalService } from './modules.js';
import {
  MethodExtractionService,
  type ExtractParametersOptions,
} from './methods.js';
import { transformMethodsEffect } from './transformer.js';
import type { GeneratedSchemas } from './schema-generator.js';
import { normalizeStructureRefsEffect } from './schema-normalizer.js';
import { collapseAliasRefs } from './schema-alias-collapser.js';
import { mergeSchemasEffect } from './schema-merger.js';
import { filterMethods } from './filter.js';
import { transformSpecForVersion } from './schema-version-transformer.js';
import { ConfigService } from './config.js';
import { validateSpec, type ValidationResult } from './spec-validator.js';
import { runGeneratorApiPromise } from './public-api.js';
import {
  createTypeResolverProject,
  resolveTypeLocations,
  resolveTypeLocationsFast,
} from './type-resolver.js';
import type { ValidationConstraints } from './validation-mapper.js';
import { runtimeLayerFor } from './runtime-layer.js';
import { generatorServicesLayer } from './service-layer.js';
import { SchemaService } from './schema-service.js';
import { ValidationService } from './validation-service.js';
import { OutputService } from './output-service.js';

const DEFAULT_ENTRY = 'src/app.module.ts';
const DEFAULT_DTO_GLOB = [
  '**/*.dto.ts',
  '**/*.entity.ts',
  '**/*.model.ts',
  '**/*.schema.ts',
] as const;

type MutablePaths = {
  [path: string]: {
    [method: string]: OpenApiPaths[string][string];
  };
};

/**
 * Merges decorator-based security with global security requirements.
 *
 * Behavior:
 * - If operation has no decorator security, it inherits global (no change)
 * - If operation has decorator security, merge with global security
 * - Merging combines both into a single security requirement (AND logic)
 */
const mergeSingleSecurityRequirement = (
  left: SecurityRequirement,
  right: SecurityRequirement,
): SecurityRequirement => {
  const merged: Record<string, string[]> = {};

  for (const requirement of [left, right]) {
    for (const [scheme, scopes] of Object.entries(requirement)) {
      const existingScopes = merged[scheme] ?? [];
      merged[scheme] = [...new Set([...existingScopes, ...scopes])];
    }
  }

  return merged;
};

const mergeSecurityWithGlobal = (
  paths: OpenApiPaths,
  globalSecurity: readonly SecurityRequirement[] | undefined,
): OpenApiPaths => {
  if (!globalSecurity || globalSecurity.length === 0) {
    return paths; // No global security to merge
  }

  const mergedPaths: MutablePaths = {};

  for (const [path, methods] of Object.entries(paths)) {
    const mergedMethods: MutablePaths[string] = {};

    for (const [method, operation] of Object.entries(methods)) {
      if (operation.security && operation.security.length > 0) {
        // Preserve OR alternatives by building a cross product:
        // (global A OR global B) AND (operation C OR operation D)
        // -> (A+C) OR (A+D) OR (B+C) OR (B+D)
        const mergedSecurity: SecurityRequirement[] = [];

        for (const globalReq of globalSecurity) {
          for (const operationReq of operation.security) {
            mergedSecurity.push(
              mergeSingleSecurityRequirement(globalReq, operationReq),
            );
          }
        }

        mergedMethods[method] = {
          ...operation,
          security: mergedSecurity,
        };
      } else {
        // No decorator security - operation inherits global (no change)
        mergedMethods[method] = operation;
      }
    }

    mergedPaths[path] = mergedMethods;
  }

  return mergedPaths as OpenApiPaths;
};

/**
 * Standard OpenAPI top-level field order
 */
const OPENAPI_FIELD_ORDER = [
  'openapi',
  'info',
  'servers',
  'paths',
  'components',
  'tags',
  'security',
];

/**
 * Recursively sort object keys.
 * - Top-level OpenAPI fields are ordered per spec convention
 * - Nested objects are sorted alphabetically for consistency
 */
const sortObjectKeysDeep = <T>(obj: T, isTopLevel = false): T => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sortObjectKeysDeep(item, false)) as T;
  }

  const sorted: Record<string, unknown> = {};
  const objRecord = obj as Record<string, unknown>;
  const keys = Object.keys(objRecord);

  // Sort keys: use OpenAPI order for top-level, alphabetical otherwise
  const sortedKeys = isTopLevel
    ? keys.sort((a, b) => {
        const aIndex = OPENAPI_FIELD_ORDER.indexOf(a);
        const bIndex = OPENAPI_FIELD_ORDER.indexOf(b);
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        return a.localeCompare(b);
      })
    : keys.sort();

  for (const key of sortedKeys) {
    sorted[key] = sortObjectKeysDeep(objRecord[key], false);
  }

  return sorted as T;
};

/**
 * Find all schema refs in paths that aren't defined in schemas.
 * Returns a set of missing schema names.
 */
const findMissingSchemaRefs = (
  paths: OpenApiSpec['paths'],
  schemas: Record<string, OpenApiSchema>,
): Set<string> => {
  const defined = new Set(Object.keys(schemas));
  const missing = new Set<string>();

  const findRefs = (obj: unknown): void => {
    if (!obj || typeof obj !== 'object') return;

    const record = obj as Record<string, unknown>;
    if (typeof record.$ref === 'string') {
      const ref = record.$ref as string;
      if (ref.startsWith('#/components/schemas/')) {
        const schemaName = ref.replace('#/components/schemas/', '');
        if (!defined.has(schemaName)) {
          missing.add(schemaName);
        }
      }
    }

    for (const value of Object.values(record)) {
      findRefs(value);
    }
  };

  findRefs(paths);
  return missing;
};

const isGenericSchemaRef = (name: string): boolean =>
  name.includes('<') && name.endsWith('>');

const NON_IMPORTABLE_TYPE_NAMES = new Set([
  'string',
  'number',
  'boolean',
  'null',
  'undefined',
  'void',
  'unknown',
  'any',
  'never',
  'object',
  'true',
  'false',
  'Array',
  'ReadonlyArray',
  'Record',
  'Promise',
  'Partial',
  'Required',
  'Pick',
  'Omit',
  'Exclude',
  'Extract',
  'Readonly',
  'keyof',
  'infer',
  'extends',
]);

const extractTypeIdentifiers = (typeRef: string): Set<string> => {
  const withoutStringLiterals = typeRef.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '');

  const matches =
    withoutStringLiterals.match(/\b[A-Za-z_$][A-Za-z0-9_$]*\b/g) ?? [];

  return new Set(
    matches.filter((name) => !NON_IMPORTABLE_TYPE_NAMES.has(name)),
  );
};

const toModuleImportPath = (fromDir: string, filePath: string): string => {
  const importPath = relative(fromDir, filePath).replace(/\\/g, '/');
  return importPath.startsWith('.') ? importPath : `./${importPath}`;
};

const resolveSymbolLocations = (
  tsconfig: string,
  symbolNames: Set<string>,
): Map<string, string> => {
  if (symbolNames.size === 0) {
    return new Map();
  }

  const tsconfigDir = dirname(tsconfig);
  const resolved = resolveTypeLocationsFast(tsconfigDir, symbolNames);

  const unresolved = new Set(
    [...symbolNames].filter((name) => !resolved.has(name)),
  );

  if (unresolved.size > 0) {
    const project = createTypeResolverProject(tsconfig);
    const morphResolved = resolveTypeLocations(project, unresolved);
    for (const [name, filePath] of morphResolved) {
      resolved.set(name, filePath);
    }
  }

  return resolved;
};

const missingGenericSchemasCache = new Map<string, GeneratedSchemas>();

const buildMissingGenericCacheKey = (
  genericRefs: readonly string[],
  tsconfig: string,
  symbolLocations: ReadonlyMap<string, string>,
): string => {
  const refs = [...genericRefs].sort();
  const relevantSymbols = new Set<string>();

  for (const genericRef of refs) {
    for (const identifier of extractTypeIdentifiers(genericRef)) {
      relevantSymbols.add(identifier);
    }
  }

  const symbolEntries = [...relevantSymbols]
    .sort()
    .map((symbol) => `${symbol}:${symbolLocations.get(symbol) ?? ''}`);

  return `${tsconfig}||${refs.join('|')}||${symbolEntries.join('|')}`;
};

const generateMissingGenericSchemasEffect = Effect.fn(
  'Generate.generateMissingGenericSchemas',
)(function* (
  genericRefs: readonly string[],
  tsconfig: string,
  symbolLocations: ReadonlyMap<string, string>,
) {
  if (genericRefs.length === 0) {
    return { definitions: {} };
  }

  const cacheKey = buildMissingGenericCacheKey(
    genericRefs,
    tsconfig,
    symbolLocations,
  );
  const cached = missingGenericSchemasCache.get(cacheKey);
  if (cached) {
    return { definitions: { ...cached.definitions } };
  }

  const importGroups = new Map<string, Set<string>>();
  const aliases: Array<{ aliasName: string; schemaName: string }> = [];
  const aliasLines: string[] = [];

  for (const [index, genericRef] of genericRefs.entries()) {
    const identifiers = [...extractTypeIdentifiers(genericRef)];
    if (identifiers.length === 0) {
      continue;
    }

    const unresolved = identifiers.filter((name) => !symbolLocations.has(name));
    if (unresolved.length > 0) {
      continue;
    }

    for (const identifier of identifiers) {
      const filePath = symbolLocations.get(identifier);
      if (!filePath) continue;
      const existing = importGroups.get(filePath) ?? new Set<string>();
      existing.add(identifier);
      importGroups.set(filePath, existing);
    }

    const aliasName = `__MissingGenericRef${index}`;
    aliases.push({ aliasName, schemaName: genericRef });
    aliasLines.push(`export type ${aliasName} = ${genericRef};`);
  }

  if (aliases.length === 0) {
    return { definitions: {} };
  }

  const tempDir = dirname(tsconfig);
  const tempFilePath = join(
    tempDir,
    `.openapi.missing-generic.${randomUUID()}.ts`,
  );

  const importLines = [...importGroups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([filePath, symbols]) => {
      const importPath = toModuleImportPath(tempDir, filePath);
      const names = [...symbols].sort().join(', ');
      return `import type { ${names} } from '${importPath}';`;
    });

  yield* Effect.try({
    try: () =>
      writeFileSync(
        tempFilePath,
        [...importLines, '', ...aliasLines, ''].join('\n'),
        'utf-8',
      ),
    catch: (cause) =>
      MissingGenericSchemaTempFileWriteError.create(tempFilePath, cause),
  });

  const cleanupEffect = Effect.try({
    try: () => {
      if (existsSync(tempFilePath)) {
        unlinkSync(tempFilePath);
      }
    },
    catch: (cause) =>
      MissingGenericSchemaTempFileCleanupError.create(tempFilePath, cause),
  }).pipe(
    Effect.catchTag('MissingGenericSchemaTempFileCleanupError', () =>
      Effect.void,
    ),
  );

  const generateFromTempFile = Effect.fn(
    'Generate.generateMissingGenericSchemas.fromTempFile',
  )(function* (inputTempFilePath: string, inputTsconfig: string) {
    const generated = yield* SchemaService.generateSchemasFromFiles(
      [inputTempFilePath],
      inputTsconfig,
    );

    const definitions = { ...generated.definitions };
    for (const { aliasName, schemaName } of aliases) {
      const resolvedSchema =
        definitions[schemaName] ?? definitions[aliasName] ?? undefined;
      if (resolvedSchema) {
        definitions[schemaName] = resolvedSchema;
      }
      delete definitions[aliasName];
    }

    return { definitions };
  });

  const generated = yield* generateFromTempFile(tempFilePath, tsconfig).pipe(
    Effect.ensuring(cleanupEffect),
  );

  missingGenericSchemasCache.set(cacheKey, {
    definitions: { ...generated.definitions },
  });

  return generated;
});

/**
 * Extract validation constraints from DTO files and merge into schemas
 */
const extractValidationConstraintsEffect = Effect.fn(
  'Generate.extractValidationConstraints',
)(function* (
  dtoGlobPatterns: readonly string[],
  basePath: string,
  tsconfig: string,
  schemas: GeneratedSchemas,
) {
  // Find all DTO files in parallel
  const absolutePatterns = dtoGlobPatterns.map((pattern) =>
    pattern.startsWith('/') ? pattern : join(basePath, pattern),
  );

  const fileArrays = yield* Effect.all(
    absolutePatterns.map((pattern) =>
      Effect.tryPromise({
        try: () => nodeGlob(pattern, { absolute: true, nodir: true }),
        catch: (cause) => DtoGlobResolutionError.create(pattern, cause),
      }),
    ),
    { concurrency: 'unbounded' },
  );

  const dtoFiles = fileArrays.flat();

  yield* Effect.annotateCurrentSpan('dtoPatternCount', absolutePatterns.length);
  yield* Effect.annotateCurrentSpan('dtoFileCount', dtoFiles.length);

  if (dtoFiles.length === 0) {
    return schemas;
  }

  // Create ts-morph project with optimized compiler options
  const project = new Project({
    tsConfigFilePath: tsconfig,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      // Skip type checking for performance - we only need AST structure
      skipLibCheck: true,
      skipDefaultLibCheck: true,
      allowJs: false,
      declaration: false,
      noEmit: true,
    },
  });

  // Add all DTO files at once for efficiency
  const dtoSourceFiles = project.addSourceFilesAtPaths(dtoFiles);

  // Resolve imports so symbols from imported files (e.g., enums) can be followed.
  // This is needed for @ApiProperty({ enum: MyEnum }) where MyEnum is in a non-DTO file.
  project.resolveSourceFileDependencies();

  // Extract constraints from each class — only from DTO files, not resolved dependencies.
  // Resolved dependencies are for symbol resolution only (e.g., following enum imports).
  const classConstraints = new Map<
    string,
    Record<string, ValidationConstraints>
  >();
  const classRequired = new Map<string, readonly string[]>();

  for (const sourceFile of dtoSourceFiles) {
    for (const classDecl of sourceFile.getClasses()) {
      const className = classDecl.getName();
      if (!className) continue;

      // Process all classes in DTO files
      const { constraints, required } =
        yield* ValidationService.extractClassValidationInfo(classDecl);

      if (Object.keys(constraints).length > 0) {
        classConstraints.set(className, constraints);
      }

      if (required.length > 0) {
        classRequired.set(className, required);
      }
    }
  }

  yield* Effect.logDebug('Validation extraction complete').pipe(
    Effect.annotateLogs({
      dtoFiles: dtoFiles.length,
      constrainedClasses: classConstraints.size,
      classesWithRequired: classRequired.size,
    }),
  );

  // Merge constraints into schemas
  return yield* ValidationService.mergeValidationConstraints(
    schemas,
    classConstraints,
    classRequired,
  );
});

const pathExistsEffect = Effect.fn('Generate.pathExists')(function* (
  filePath: string,
) {
  return yield* Effect.sync(() => existsSync(filePath));
});

/**
 * Finds tsconfig.json by searching up from the given directory.
 * File-system checks are kept in Effect to avoid hidden helper IO.
 */
const findTsConfigEffect = Effect.fn('Generate.findTsConfig')(function* (
  startDir: string,
) {
  let currentDir = resolve(startDir);

  while (true) {
    const tsconfigPath = join(currentDir, 'tsconfig.json');
    const tsconfigExists = yield* pathExistsEffect(tsconfigPath);
    if (tsconfigExists) {
      return tsconfigPath;
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return undefined;
});

/**
 * Internal Effect-based logic to extract method infos from a single entry
 */
const extractMethodInfosFromEntry = (
  tsconfig: string,
  entry: string,
  extractOptions: ExtractParametersOptions = {},
) =>
  Effect.fn('Generate.extractMethodInfosFromEntry')(function* (
    inputTsconfig: string,
    inputEntry: string,
    inputExtractOptions: ExtractParametersOptions,
  ) {
    const project = new Project({
      tsConfigFilePath: inputTsconfig,
      skipAddingFilesFromTsConfig: true,
      compilerOptions: {
        skipLibCheck: true,
        skipDefaultLibCheck: true,
        allowJs: false,
        declaration: false,
        noEmit: true,
      },
    });

    // Add only the entry file - ts-morph will resolve imports on-demand
    project.addSourceFilesAtPaths(inputEntry);

    const entrySourceFile = project.getSourceFile(inputEntry);
    if (!entrySourceFile) {
      return yield* EntryNotFoundError.fileNotFound(inputEntry);
    }

    // Find the module class - try AppModule first, then any class with @Module decorator
    let entryClass = entrySourceFile.getClass('AppModule');
    if (!entryClass) {
      // Try to find any class with @Module decorator
      for (const cls of entrySourceFile.getClasses()) {
        const hasModuleDecorator = cls
          .getDecorators()
          .some((d) => d.getName() === 'Module');
        if (hasModuleDecorator) {
          entryClass = cls;
          break;
        }
      }
    }

    if (!entryClass) {
      return yield* EntryNotFoundError.classNotFound(inputEntry, 'Module');
    }

    const modules = yield* ModuleTraversalService.getModules(entryClass);

    const methodInfos = yield* Effect.forEach(
      modules.flatMap((mod) => mod.controllers),
      (controller) =>
        MethodExtractionService.getControllerMethodInfos(
          controller,
          inputExtractOptions,
        ),
      { concurrency: 'unbounded' },
    );

    return methodInfos.flat();
  })(tsconfig, entry, extractOptions);

/**
 * Internal Effect-based logic to extract method infos from multiple entries
 */
const extractMethodInfosEffect = Effect.fn(
  'Generate.extractMethodInfos',
)(function* (
  tsconfig: string,
  entries: readonly string[],
  extractOptions: ExtractParametersOptions,
) {
  const allMethodInfos = yield* Effect.forEach(
    entries,
    (entry) => extractMethodInfosFromEntry(tsconfig, entry, extractOptions),
    { concurrency: 'unbounded' },
  );

  // Flatten and deduplicate by path + method combination
  const seen = new Set<string>();
  const deduped: (typeof allMethodInfos)[number] = [];

  for (const methodInfos of allMethodInfos) {
    for (const info of methodInfos) {
      const key = `${info.httpMethod}:${info.path}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(info);
      }
    }
  }

  return deduped;
});

const resolveTsconfigForGenerate = Effect.fn(
  'Generate.resolveTsconfig',
)(function* (
  filesTsconfig: string | undefined,
  configDir: string,
  entries: readonly string[],
  absoluteConfigPath: string,
) {
  const discoveredTsconfig = filesTsconfig
    ? resolve(configDir, filesTsconfig)
    : yield* findTsConfigEffect(dirname(entries[0]));

  if (!discoveredTsconfig) {
    return yield* ConfigValidationError.fromIssues(absoluteConfigPath, [
      'Could not find tsconfig.json. Please specify files.tsconfig in your config file.',
    ]);
  }

  const discoveredTsconfigExists = yield* pathExistsEffect(discoveredTsconfig);
  if (!discoveredTsconfigExists) {
    return yield* ConfigValidationError.fromIssues(absoluteConfigPath, [
      `tsconfig.json not found at: ${discoveredTsconfig}`,
    ]);
  }

  return discoveredTsconfig;
});

export interface GenerateResult {
  /** Path where the OpenAPI spec was written */
  readonly outputPath: string;
  /** Number of paths in the generated spec */
  readonly pathCount: number;
  /** Number of operations in the generated spec */
  readonly operationCount: number;
  /** Number of schemas in the generated spec */
  readonly schemaCount: number;
  /** Validation result checking for broken refs */
  readonly validation: ValidationResult;
}

/**
 * Canonical Effect-native generation pipeline.
 */
export const generateEffect = Effect.fn('Generate.generateEffect')(function* (
  configPath: string,
  overrides?: GenerateOverrides,
) {
  const absoluteConfigPath = resolve(configPath);
  const configDir = dirname(absoluteConfigPath);

  yield* Effect.annotateCurrentSpan('configPath', absoluteConfigPath);

  const config = yield* ConfigService.loadConfigFromFile(absoluteConfigPath).pipe(
    Effect.tap(() =>
      Effect.logDebug('Config loaded').pipe(
        Effect.annotateLogs({ configPath: absoluteConfigPath }),
      ),
    ),
  );

  const files = config.files ?? {};
  const options = config.options ?? {};
  const aliasRefsMode = options.schemas?.aliasRefs ?? 'collapse';
  const openapi = config.openapi;
  const security = openapi.security ?? {};

  const rawEntry = files.entry ?? DEFAULT_ENTRY;
  const entries = (Array.isArray(rawEntry) ? rawEntry : [rawEntry]).map((e) =>
    resolve(configDir, e),
  );
  const output = resolve(configDir, config.output);

  const tsconfig = yield* resolveTsconfigForGenerate(
    files.tsconfig,
    configDir,
    entries,
    absoluteConfigPath,
  );

  yield* Effect.annotateCurrentSpan('entryCount', entries.length);
  yield* Effect.annotateCurrentSpan('tsconfig', tsconfig);

  const extractOptions: ExtractParametersOptions = {
    query: options.query,
  };

  const dtoGlobArray =
    files.dtoGlob === undefined
      ? [...DEFAULT_DTO_GLOB]
      : Array.isArray(files.dtoGlob)
        ? files.dtoGlob
        : [files.dtoGlob];

  yield* Effect.annotateCurrentSpan('dtoGlobCount', dtoGlobArray.length);
  const [extractedMethodInfos, initialSchemas] = yield* Effect.all(
    [
      extractMethodInfosEffect(tsconfig, entries, extractOptions).pipe(
        Effect.tap((methods) =>
          Effect.logDebug('Method extraction complete').pipe(
            Effect.annotateLogs({ methodCount: methods.length, entries }),
          ),
        ),
      ),
      SchemaService.generateSchemas({
        dtoGlob: dtoGlobArray as string[],
        tsconfig,
        basePath: configDir,
      }).pipe(
        Effect.tap((schemas) =>
          Effect.logDebug('Schema generation complete').pipe(
            Effect.annotateLogs({
              schemaCount: Object.keys(schemas.definitions).length,
              dtoGlob: dtoGlobArray,
            }),
          ),
        ),
      ),
    ],
    { concurrency: 2 },
  );

  // Process method infos into paths
  const filteredMethodInfos = filterMethods(extractedMethodInfos, {
    excludeDecorators: options.excludeDecorators,
    pathFilter: options.pathFilter,
  });
  yield* Effect.annotateCurrentSpan(
    'filteredMethodCount',
    filteredMethodInfos.length,
  );

  let paths = yield* transformMethodsEffect(filteredMethodInfos);
  yield* Effect.annotateCurrentSpan('initialPathCount', Object.keys(paths).length);

  if (options.basePath) {
    const prefix = options.basePath.startsWith('/')
      ? options.basePath
      : `/${options.basePath}`;
    const prefixedPaths: Record<string, (typeof paths)[string]> = {};
    for (const [path, methods] of Object.entries(paths)) {
      const prefixedPath = path.startsWith('/')
        ? `${prefix}${path}`
        : `${prefix}/${path}`;
      prefixedPaths[prefixedPath] = methods;
    }
    paths = prefixedPaths;
  }
  yield* Effect.annotateCurrentSpan(
    'basePathApplied',
    options.basePath ? 'true' : 'false',
  );

  // Merge decorator security with global security
  // Operations with decorator security get merged with global (AND logic)
  // Operations without decorator security inherit global as-is
  paths = mergeSecurityWithGlobal(
    paths as OpenApiPaths,
    security.global,
  ) as typeof paths;
  yield* Effect.annotateCurrentSpan(
    'globalSecurityRequirementCount',
    security.global?.length ?? 0,
  );

  // Process schemas if generated
  let schemas: Record<string, OpenApiSchema> = {};

  if (initialSchemas) {
    let generatedSchemas: GeneratedSchemas = initialSchemas;

    const shouldExtractValidation = options.extractValidation !== false;
    yield* Effect.annotateCurrentSpan(
      'validationExtractionEnabled',
      shouldExtractValidation ? 'true' : 'false',
    );

    if (shouldExtractValidation) {
      if (Object.keys(generatedSchemas.definitions).length > 0) {
        generatedSchemas = yield* extractValidationConstraintsEffect(
          dtoGlobArray,
          configDir,
          tsconfig,
          generatedSchemas,
        );
      } else {
        yield* Effect.annotateCurrentSpan('validationExtractionSkipped', 'true');
      }
    }

    // e.g., SelectRule<structure-123...> → SelectRule<NamespaceLabels>
    generatedSchemas = yield* normalizeStructureRefsEffect(generatedSchemas);

    // First merge to get initial schemas
    let mergeResult = yield* mergeSchemasEffect(
      paths as unknown as OpenApiSpec['paths'],
      generatedSchemas,
    );
    schemas = mergeResult.schemas;
    yield* Effect.annotateCurrentSpan(
      'initialMergedSchemaCount',
      Object.keys(schemas).length,
    );

    // Hybrid approach: Find and resolve any missing schemas automatically
    const missingRefs = findMissingSchemaRefs(
      paths as unknown as OpenApiSpec['paths'],
      schemas,
    );
    const missingGenericRefsBeforeResolution = [...missingRefs].filter(
      isGenericSchemaRef,
    );
    const missingNonGenericRefsBeforeResolution = new Set(
      [...missingRefs].filter((ref) => !isGenericSchemaRef(ref)),
    );
    yield* Effect.annotateCurrentSpan(
      'missingRefCountBeforeResolution',
      missingRefs.size,
    );
    yield* Effect.annotateCurrentSpan(
      'missingGenericRefCountBeforeResolution',
      missingGenericRefsBeforeResolution.length,
    );
    yield* Effect.annotateCurrentSpan(
      'missingNonGenericRefCountBeforeResolution',
      missingNonGenericRefsBeforeResolution.size,
    );

    if (missingRefs.size > 0) {
      const resolvedNonGenericLocations = new Map<string, string>();

      if (missingNonGenericRefsBeforeResolution.size > 0) {
        // Fast grep-based resolution (much faster for large codebases)
        const tsconfigDir = dirname(tsconfig);
        const fastResolved = resolveTypeLocationsFast(
          tsconfigDir,
          missingNonGenericRefsBeforeResolution,
        );

        for (const [type, path] of fastResolved) {
          resolvedNonGenericLocations.set(type, path);
        }

        // Fall back to ts-morph for types not found by fast resolution
        const unresolvedTypes = new Set(
          [...missingNonGenericRefsBeforeResolution].filter(
            (t) => !resolvedNonGenericLocations.has(t.replace(/<.*>$/, '')),
          ),
        );
        yield* Effect.annotateCurrentSpan(
          'unresolvedTypeCountAfterFastLookup',
          unresolvedTypes.size,
        );

        if (unresolvedTypes.size > 0) {
          const project = createTypeResolverProject(tsconfig);
          const morphResolved = resolveTypeLocations(project, unresolvedTypes);

          for (const [type, path] of morphResolved) {
            resolvedNonGenericLocations.set(type, path);
          }
        }
      } else {
        yield* Effect.annotateCurrentSpan('unresolvedTypeCountAfterFastLookup', 0);
      }
      yield* Effect.annotateCurrentSpan(
        'resolvedTypeLocationCount',
        resolvedNonGenericLocations.size,
      );

      if (resolvedNonGenericLocations.size > 0) {
        const additionalFiles = [...new Set(resolvedNonGenericLocations.values())];

        const additionalSchemas = yield* SchemaService.generateSchemasFromFiles(
          additionalFiles,
          tsconfig,
        );

        if (Object.keys(additionalSchemas.definitions).length > 0) {
          const normalizedAdditional = yield* normalizeStructureRefsEffect(
            additionalSchemas,
          );

          const combinedSchemas: GeneratedSchemas = {
            definitions: {
              ...generatedSchemas.definitions,
              ...normalizedAdditional.definitions,
            },
          };
          generatedSchemas = combinedSchemas;

          mergeResult = yield* mergeSchemasEffect(
            paths as unknown as OpenApiSpec['paths'],
            combinedSchemas,
          );
          schemas = mergeResult.schemas;
          yield* Effect.annotateCurrentSpan(
            'schemaCountAfterAdditionalResolution',
            Object.keys(schemas).length,
          );
        }
      }

      const unresolvedAfterFileResolution = findMissingSchemaRefs(
        paths as unknown as OpenApiSpec['paths'],
        schemas,
      );
      yield* Effect.annotateCurrentSpan(
        'missingRefCountAfterFileResolution',
        unresolvedAfterFileResolution.size,
      );
      const unresolvedGenericRefs = [...unresolvedAfterFileResolution].filter(
        isGenericSchemaRef,
      );
      yield* Effect.annotateCurrentSpan(
        'unresolvedGenericRefCount',
        unresolvedGenericRefs.length,
      );

      if (unresolvedGenericRefs.length > 0) {
        const genericSymbols = new Set<string>();
        for (const ref of unresolvedGenericRefs) {
          for (const symbol of extractTypeIdentifiers(ref)) {
            genericSymbols.add(symbol);
          }
        }

        const resolvedGenericSymbols = resolveSymbolLocations(
          tsconfig,
          genericSymbols,
        );
        for (const [name, filePath] of resolvedNonGenericLocations) {
          resolvedGenericSymbols.set(name, filePath);
        }

        const genericSchemas = yield* generateMissingGenericSchemasEffect(
          unresolvedGenericRefs,
          tsconfig,
          resolvedGenericSymbols,
        );

        if (Object.keys(genericSchemas.definitions).length > 0) {
          const normalizedGeneric =
            yield* normalizeStructureRefsEffect(genericSchemas);
          const combinedSchemas: GeneratedSchemas = {
            definitions: {
              ...generatedSchemas.definitions,
              ...normalizedGeneric.definitions,
            },
          };
          generatedSchemas = combinedSchemas;

          mergeResult = yield* mergeSchemasEffect(
            paths as unknown as OpenApiSpec['paths'],
            combinedSchemas,
          );
          schemas = mergeResult.schemas;
          yield* Effect.annotateCurrentSpan(
            'schemaCountAfterGenericResolution',
            Object.keys(schemas).length,
          );
        }
      }
    }
  }

  if (aliasRefsMode === 'collapse' && Object.keys(schemas).length > 0) {
    const collapsed = collapseAliasRefs(paths as OpenApiPaths, schemas);
    paths = collapsed.paths as typeof paths;
    schemas = collapsed.schemas;
  }
  yield* Effect.annotateCurrentSpan('aliasRefMode', aliasRefsMode);

  const securitySchemes =
    security.schemes && security.schemes.length > 0
      ? buildSecuritySchemes(security.schemes)
      : undefined;

  const hasSchemas = Object.keys(schemas).length > 0;
  const hasSecuritySchemes =
    securitySchemes && Object.keys(securitySchemes).length > 0;
  const components =
    hasSchemas || hasSecuritySchemes
      ? {
          ...(hasSchemas && { schemas }),
          ...(hasSecuritySchemes && { securitySchemes }),
        }
      : undefined;

  // Get OpenAPI version from config (default to 3.0.3)
  const openApiVersion = openapi.version ?? '3.0.3';
  yield* Effect.annotateCurrentSpan('openApiVersion', openApiVersion);

  // Always include servers and tags (even if empty) to match NestJS Swagger output
  let spec: OpenApiSpec = {
    openapi: openApiVersion,
    info: {
      title: openapi.info.title,
      version: openapi.info.version,
      ...(openapi.info.description && {
        description: openapi.info.description,
      }),
      ...(openapi.info.contact && { contact: openapi.info.contact }),
      ...(openapi.info.license && { license: openapi.info.license }),
    },
    servers: openapi.servers ?? [],
    paths: paths as unknown as OpenApiSpec['paths'],
    ...(components && { components }),
    tags: openapi.tags ?? [],
    ...(security.global &&
      security.global.length > 0 && {
        security: security.global,
      }),
  };

  // Transform spec for OpenAPI 3.1/3.2 if needed
  if (openApiVersion !== '3.0.3') {
    spec = transformSpecForVersion(spec, openApiVersion);
  }

  // Sort keys to match NestJS Swagger output order
  const sortedSpec = sortObjectKeysDeep(spec, true);

  yield* OutputService.ensureOutputDirectory(output);

  const format = overrides?.format ?? config.format ?? 'json';
  yield* Effect.annotateCurrentSpan('outputFormat', format);
  const serializedSpec = yield* OutputService.serializeSpec(
    sortedSpec,
    output,
    format,
  );
  yield* OutputService.writeOutput(output, serializedSpec, format);

  const pathCount = Object.keys(paths).length;
  const operationCount = Object.values(paths).reduce(
    (acc, methods) => acc + Object.keys(methods).length,
    0,
  );
  const schemaCount = Object.keys(schemas).length;
  yield* Effect.annotateCurrentSpan('finalPathCount', pathCount);
  yield* Effect.annotateCurrentSpan('finalOperationCount', operationCount);
  yield* Effect.annotateCurrentSpan('finalSchemaCount', schemaCount);

  // Validate the spec for broken refs
  const validation = validateSpec(sortedSpec);
  yield* Effect.annotateCurrentSpan('validationTotalRefCount', validation.totalRefs);
  yield* Effect.annotateCurrentSpan(
    'validationBrokenRefCount',
    validation.brokenRefCount,
  );
  yield* Effect.annotateCurrentSpan(
    'validationValid',
    validation.valid ? 'true' : 'false',
  );

  yield* Effect.logInfo('OpenAPI generation pipeline complete').pipe(
    Effect.annotateLogs({
      outputPath: output,
      format,
      pathCount,
      operationCount,
      schemaCount,
      validationValid: validation.valid,
      brokenRefCount: validation.brokenRefCount,
    }),
  );

  return {
    outputPath: output,
    pathCount,
    operationCount,
    schemaCount,
    validation,
  };
});

/**
 * Promise-based public compatibility wrapper.
 */
export const generate = async (
  configPath: string,
  overrides?: GenerateOverrides,
): Promise<GenerateResult> => {
  const debug = overrides?.debug ?? false;
  const telemetry = overrides?.telemetry;
  const program = generateEffect(configPath, overrides).pipe(
    Effect.provide(generatorServicesLayer),
    Effect.provide(runtimeLayerFor(debug, telemetry)),
  ) as Effect.Effect<GenerateResult, GeneratorError, never>;

  return runGeneratorApiPromise(program);
};
