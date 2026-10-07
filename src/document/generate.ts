/**
 * Promise-based entry point for generating OpenAPI specifications.
 *
 * This module provides a clean, Promise-based API that hides the internal
 * Effect-TS implementation from consumers.
 */

import { Effect } from 'effect';
import { existsSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { Project, type ClassDeclaration } from 'ts-morph';
import { glob as nodeGlob } from 'glob';
import type {
  GenerateOverrides,
  OpenApiSpec,
  OpenApiSchema,
  SecurityRequirement,
  OpenApiPaths,
} from '../config/types.js';
import { buildSecuritySchemes } from './security.js';
import {
  EntryNotFoundError,
  ConfigValidationError,
  DtoGlobResolutionError,
  type GeneratorError,
} from '../config/errors.js';
import { ModuleTraversalService, type ModuleScope } from '../analysis/modules.js';
import {
  MethodExtractionService,
  type ExtractParametersOptions,
} from '../analysis/methods.js';
import { TransformerService } from './transformer.js';
import {
  generateNamedSchemas,
  generateSchemasFromVirtualFile,
  type GeneratedSchemas,
  type JsonSchema,
} from '../schema/schema-generator.js';
import { normalizeStructureRefsEffect } from '../schema/schema-normalizer.js';
import { collapseAliasRefs } from '../schema/schema-alias-collapser.js';
import { expandConstSchemas } from '../schema/schema-const-expander.js';
import { mergeSchemasEffect } from '../schema/schema-merger.js';
import { filterMethods } from '../analysis/filter.js';
import { transformSpecForVersion } from '../schema/schema-version-transformer.js';
import { ConfigService } from '../config/config.js';
import { validateSpec, type ValidationResult } from './spec-validator.js';
import { runGeneratorApiPromise } from '../public-api.js';
import {
  createTypeResolverProject,
  resolveTypeLocations,
  resolveLocalTypeLocations,
  resolveTypeLocationsFast,
} from '../schema/type-resolver.js';
import {
  ValidationMapperService,
  type ValidationConstraints,
} from '../analysis/validation-mapper.js';
import { runtimeLayerFor } from '../runtime/runtime-layer.js';
import { generatorServicesLayer } from '../runtime/service-layer.js';
import { SchemaService } from '../schema/schema-service.js';
import {
  EMPTY_PLAN,
  applyPlanToMethods,
  collisionInlinedNames,
  namingForPlan,
  planSchemaNames,
  regenerateDeclarations,
} from '../schema/schema-identity.js';
import { declarationKey } from '../analysis/declaration-references.js';
import { inlineSchemas } from '../schema/schema-inliner.js';
import type { DeclarationRef } from '../model/domain.js';
import {
  DEFAULT_ENUM_STYLE,
  NAMED_ENUM_REF,
  type SchemaNaming,
} from '../analysis/property-schema.js';
import type { DecoratorExpansionOptions } from '../analysis/decorators.js';
import { clearSchemaProgramCache } from '../schema/schema-program.js';
import {
  adaptExamplesForVersion,
  sanitizeComponentNames,
} from '../schema/spec-compliance.js';
import type { MethodInfo } from '../model/domain.js';
import type { PathTransform } from '../config/types.js';
import { clearRunProjects, getRunProject } from '../analysis/run-project.js';
import {
  applyMappedTypes,
  collectMappedTypeBases,
  getMappedTypeBase,
} from '../analysis/mapped-types.js';
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

  // An in-memory module next to the tsconfig, so relative imports resolve
  const virtualDir = dirname(tsconfig);
  const virtualFilePath = join(virtualDir, '.openapi.missing-generic.ts');

  const importLines = [...importGroups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([filePath, symbols]) => {
      const importPath = toModuleImportPath(virtualDir, filePath);
      const names = [...symbols].sort().join(', ');
      return `import type { ${names} } from '${importPath}';`;
    });

  const generatedFromAliases = yield* generateSchemasFromVirtualFile(
    virtualFilePath,
    [...importLines, '', ...aliasLines, ''].join('\n'),
    tsconfig,
  );

  const generated = { definitions: { ...generatedFromAliases.definitions } };
  for (const { aliasName, schemaName } of aliases) {
    const resolvedSchema =
      generated.definitions[schemaName] ??
      generated.definitions[aliasName] ??
      undefined;
    if (resolvedSchema) {
      generated.definitions[schemaName] = resolvedSchema;
    }
    delete generated.definitions[aliasName];
  }

  missingGenericSchemasCache.set(cacheKey, {
    definitions: { ...generated.definitions },
  });

  return generated;
});

/**
 * Resolve DTO glob patterns to absolute file paths
 */
const resolveDtoFilesEffect = Effect.fn('Generate.resolveDtoFiles')(function* (
  dtoGlobPatterns: readonly string[],
  basePath: string,
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

  const dtoFiles = [...new Set(fileArrays.flat())];

  yield* Effect.annotateCurrentSpan('dtoPatternCount', absolutePatterns.length);
  yield* Effect.annotateCurrentSpan('dtoFileCount', dtoFiles.length);

  return dtoFiles;
});

// Classes are also looked up in everything the schema files import, so
// decorator metadata does not depend on dtoGlob; a class in a schema file
// wins over one only reached through imports
const indexSchemaClasses = (
  project: Project,
  sourceFiles: ReadonlySet<string>,
  schemaNames: ReadonlySet<string>,
  plannedSources: ReadonlyMap<string, DeclarationRef>,
) => {
  const index = new Map<string, ClassDeclaration>();
  const rank = (filePath: string) => (sourceFiles.has(filePath) ? 0 : 1);

  for (const [name, ref] of plannedSources) {
    if (ref.kind !== 'class' || !schemaNames.has(name)) continue;
    const classDecl =
      project.getSourceFile(ref.filePath)?.getClass(ref.name) ??
      project.addSourceFileAtPathIfExists(ref.filePath)?.getClass(ref.name);
    if (classDecl) index.set(name, classDecl);
  }

  for (const sourceFile of project.getSourceFiles()) {
    if (sourceFile.isDeclarationFile() || sourceFile.isInNodeModules()) {
      continue;
    }
    const filePath = sourceFile.getFilePath();

    for (const classDecl of sourceFile.getClasses()) {
      const name = classDecl.getName();
      if (!name || !schemaNames.has(name) || plannedSources.has(name)) continue;

      const current = index.get(name);
      if (
        !current ||
        rank(filePath) < rank(current.getSourceFile().getFilePath())
      ) {
        index.set(name, classDecl);
      }
    }
  }

  return index;
};

const overlayClassMetadataEffect = Effect.fn('Generate.overlayClassMetadata')(
  function* (
    sourceFilePaths: readonly string[],
    tsconfig: string,
    inputSchemas: GeneratedSchemas,
    plannedSources: ReadonlyMap<string, DeclarationRef>,
    expansion: DecoratorExpansionOptions,
    withValidation: boolean,
    naming: SchemaNaming,
    namedEnums: Set<string>,
  ) {
    if (sourceFilePaths.length === 0) {
      return inputSchemas;
    }

    const project = getRunProject(tsconfig);

    project.addSourceFilesAtPaths([...sourceFilePaths]);
    // Follow imports: schemas for nested types come from imported files, and
    // enums referenced by decorators need their declarations.
    project.resolveSourceFileDependencies();

    let schemas = inputSchemas;
    const classes = indexSchemaClasses(
      project,
      new Set(sourceFilePaths),
      new Set(Object.keys(schemas.definitions)),
      plannedSources,
    );

    // Base classes of mapped types are needed even when nothing else
    // references them
    const missingBases = new Map<string, ClassDeclaration>();
    for (const classDecl of classes.values()) {
      const base = getMappedTypeBase(classDecl);
      if (!base) continue;
      for (const [name, baseDecl] of collectMappedTypeBases(
        base,
        naming.componentName,
      )) {
        if (!schemas.definitions[name] && !classes.has(name)) {
          missingBases.set(name, baseDecl);
        }
      }
    }
    if (missingBases.size > 0) {
      const generatedBases = yield* generateNamedSchemas(
        new Map(
          [...missingBases].map(([name, decl]) => [
            name,
            decl.getSourceFile().getFilePath(),
          ]),
        ),
        tsconfig,
      );
      const normalizedBases =
        yield* normalizeStructureRefsEffect(generatedBases);
      schemas = {
        definitions: {
          ...normalizedBases.definitions,
          ...schemas.definitions,
        },
      };
      for (const [name, decl] of missingBases) classes.set(name, decl);
    }

    if (withValidation) {
      schemas = yield* overlayValidationConstraintsEffect(
        classes,
        schemas,
        expansion,
        naming,
        namedEnums,
      );
    }

    const composed = applyMappedTypes(schemas, classes, naming.componentName);
    return naming.enums === 'ref' ? composed : inlineInferredEnumRefs(composed);
  },
);

// As @nestjs/swagger does, an enum inferred from a TypeScript type is
// written in place; one named with `enumName` carries NAMED_ENUM_REF and stays
const inlineInferredEnumRefs = (
  schemas: GeneratedSchemas,
): GeneratedSchemas => {
  const isEnumOnly = (schema: JsonSchema | undefined) =>
    schema !== undefined && isEnumOnlySchema(schema as OpenApiSchema);

  const inline = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(inline);
    if (!value || typeof value !== 'object') return value;
    const record = value as Record<string, unknown>;
    const ref = record['$ref'];
    const refName =
      typeof ref === 'string'
        ? ref.replace(/^#\/(?:definitions|components\/schemas)\//, '')
        : undefined;
    if (refName !== undefined && !(NAMED_ENUM_REF in record)) {
      const target = schemas.definitions[refName];
      if (isEnumOnly(target)) {
        const { $ref: _ref, ...siblings } = record;
        return { ...target, ...siblings };
      }
    }
    return Object.fromEntries(
      Object.entries(record).map(([key, item]) => [key, inline(item)]),
    );
  };

  return {
    definitions: Object.fromEntries(
      Object.entries(schemas.definitions).map(([name, schema]) => [
        name,
        inline(schema) as JsonSchema,
      ]),
    ),
  };
};

/**
 * Extract validation constraints from the given classes and merge them into
 * their schemas
 */
const overlayValidationConstraintsEffect = Effect.fn(
  'Generate.extractValidationConstraints',
)(function* (
  classes: ReadonlyMap<string, ClassDeclaration>,
  schemas: GeneratedSchemas,
  expansion: DecoratorExpansionOptions,
  naming: SchemaNaming,
  namedEnums: Set<string>,
) {
  const validation = yield* ValidationMapperService;

  const classConstraints = new Map<
    string,
    Record<string, ValidationConstraints>
  >();
  const classRequired = new Map<string, readonly string[]>();
  const classOptional = new Map<string, readonly string[]>();

  for (const [className, classDecl] of classes) {
    const { constraints, required, optional, unreadable } =
      yield* validation.extractClassValidationInfo(
        classDecl,
        expansion,
        naming,
      );

    for (const note of unreadable ?? []) {
      yield* Effect.logWarning(
        `${note}; the TypeScript type is used instead. Describe it with a literal, an enum, or a static expression`,
      );
    }

    if (Object.keys(constraints).length > 0) {
      classConstraints.set(className, constraints);
    }

    if (required.length > 0) {
      classRequired.set(className, required);
    }

    if (optional.length > 0) {
      classOptional.set(className, optional);
    }
  }

  for (const properties of classConstraints.values()) {
    for (const constraints of Object.values(properties)) {
      if (constraints.enumComponent)
        namedEnums.add(constraints.enumComponent.name);
    }
  }

  yield* Effect.logDebug('Validation extraction complete').pipe(
    Effect.annotateLogs({
      classes: classes.size,
      constrainedClasses: classConstraints.size,
      classesWithRequired: classRequired.size,
    }),
  );

  // Merge constraints into schemas
  return yield* validation.mergeValidationConstraints(
    schemas,
    classConstraints,
    classRequired,
    classOptional,
  );
});

const finalizePath = (
  method: MethodInfo,
  basePath: string | undefined,
  transformPath: PathTransform | undefined,
) => {
  const prefix = basePath ? `/${basePath.replace(/^\/+|\/+$/g, '')}` : '';
  const joined =
    method.path === '/' && prefix ? prefix : `${prefix}${method.path}`;
  const path = joined.replace(/:([^/]+)/g, '{$1}') || '/';
  if (!transformPath) return path;

  const transformed = transformPath(path, {
    controller: method.controllerName,
    method: method.methodName,
    httpMethod: method.httpMethod.toLowerCase(),
  });
  return transformed.startsWith('/') ? transformed : `/${transformed}`;
};

const isEnumOnlySchema = (schema: OpenApiSchema) =>
  Array.isArray(schema.enum) &&
  schema.properties === undefined &&
  schema.$ref === undefined &&
  schema.allOf === undefined &&
  schema.anyOf === undefined &&
  schema.oneOf === undefined;

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
  scope: ModuleScope = {},
) =>
  Effect.fn('Generate.extractMethodInfosFromEntry')(function* (
    inputTsconfig: string,
    inputEntry: string,
    inputExtractOptions: ExtractParametersOptions,
  ) {
    const project = getRunProject(inputTsconfig);

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

    const controllers = yield* ModuleTraversalService.getDocumentedControllers(
      entryClass,
      scope,
    );

    const methodInfos = yield* Effect.forEach(
      controllers,
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
const extractMethodInfosEffect = Effect.fn('Generate.extractMethodInfos')(
  function* (
    tsconfig: string,
    entries: readonly string[],
    extractOptions: ExtractParametersOptions,
    scope: ModuleScope,
  ) {
    const allMethodInfos = yield* Effect.forEach(
      entries,
      (entry) =>
        extractMethodInfosFromEntry(tsconfig, entry, extractOptions, scope),
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
  },
);

const resolveTsconfigForGenerate = Effect.fn('Generate.resolveTsconfig')(
  function* (
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

    const discoveredTsconfigExists =
      yield* pathExistsEffect(discoveredTsconfig);
    if (!discoveredTsconfigExists) {
      return yield* ConfigValidationError.fromIssues(absoluteConfigPath, [
        `tsconfig.json not found at: ${discoveredTsconfig}`,
      ]);
    }

    return discoveredTsconfig;
  },
);

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
export const generateEffect = Effect.fn('Generate.generateEffect')(
  function* (configPath: string, overrides?: GenerateOverrides) {
    const absoluteConfigPath = resolve(configPath);
    const configDir = dirname(absoluteConfigPath);

    // Parsed library declarations are shared within a run, not across runs
    clearSchemaProgramCache();
    clearRunProjects();

    yield* Effect.annotateCurrentSpan('configPath', absoluteConfigPath);

    const config = yield* ConfigService.loadConfigFromFile(
      absoluteConfigPath,
    ).pipe(
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

    const expansion: DecoratorExpansionOptions = {
      decorators: options.decorators,
    };
    const extractOptions: ExtractParametersOptions = {
      query: options.query,
      expansion,
      enums: options.enums ?? DEFAULT_ENUM_STYLE,
      ...(options.versioning ? { versioning: options.versioning } : {}),
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
        extractMethodInfosEffect(tsconfig, entries, extractOptions, {
          include: options.include,
          deepScanRoutes: options.deepScanRoutes,
        }).pipe(
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

    // One schema per declaration: plan names for the declarations the
    // documented operations reach, and point the operations at them
    const dtoFiles = yield* resolveDtoFilesEffect(dtoGlobArray, configDir);
    const schemaNamePlan = initialSchemas
      ? yield* planSchemaNames(
          filteredMethodInfos,
          dtoFiles,
          options.schemaNameCollision ?? 'inline',
          configDir,
        )
      : EMPTY_PLAN;
    const documentedMethods = applyPlanToMethods(
      filteredMethodInfos,
      schemaNamePlan,
    );
    // @ApiExtraModels adds schemas even when no operation references them
    const extraModelRoots = [
      ...new Set(
        documentedMethods.flatMap((method) => method.extraModels ?? []),
      ),
    ];
    const enumStyle = options.enums ?? DEFAULT_ENUM_STYLE;
    const schemaNaming = namingForPlan(schemaNamePlan, enumStyle);
    // Enums named with `enumName` stay components in 'nest' style
    const namedEnums = new Set<string>();

    const routedMethods = documentedMethods.map((method) => ({
      ...method,
      path: finalizePath(method, options.basePath, options.transformPath),
    }));

    const transformer = yield* TransformerService;
    let paths = yield* transformer.transformMethods(routedMethods);
    yield* Effect.annotateCurrentSpan(
      'initialPathCount',
      Object.keys(paths).length,
    );

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
      const regenerated = yield* regenerateDeclarations(
        schemaNamePlan,
        filteredMethodInfos,
        tsconfig,
      );
      const plannedSources = regenerated.sources;
      let generatedSchemas: GeneratedSchemas = {
        definitions: {
          ...regenerated.extra.definitions,
          ...initialSchemas.definitions,
          ...regenerated.forced.definitions,
        },
      };

      // Files schemas were generated from; decorator metadata is read from
      // the classes declared in them and in the files they import.
      const schemaSourceFiles = new Set<string>(dtoFiles);

      // Declarations the operations reach that nothing generated yet, such as
      // classes only named in @ApiProperty({ type: () => X })
      const reachedWithoutSchema = new Map<string, string>();
      for (const method of filteredMethodInfos) {
        for (const ref of method.referencedDeclarations ?? []) {
          if (ref.generic) continue;
          if (schemaNamePlan.declarations.has(declarationKey(ref))) continue;
          if (!generatedSchemas.definitions[ref.name]) {
            reachedWithoutSchema.set(ref.name, ref.filePath);
          }
        }
      }
      if (reachedWithoutSchema.size > 0) {
        const reachedSchemas = yield* normalizeStructureRefsEffect(
          yield* generateNamedSchemas(reachedWithoutSchema, tsconfig),
        );
        generatedSchemas = {
          definitions: {
            ...reachedSchemas.definitions,
            ...generatedSchemas.definitions,
          },
        };
        for (const filePath of reachedWithoutSchema.values()) {
          schemaSourceFiles.add(filePath);
        }
      }

      // e.g., SelectRule<structure-123...> → SelectRule<NamespaceLabels>
      generatedSchemas = yield* normalizeStructureRefsEffect(generatedSchemas);

      // First merge to get initial schemas
      let mergeResult = yield* mergeSchemasEffect(
        paths as unknown as OpenApiSpec['paths'],
        generatedSchemas,
        extraModelRoots,
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
          // Types declared in the controller's own file, exported or not,
          // resolve there first, as in TypeScript
          const controllerFiles = [
            ...new Set(
              filteredMethodInfos.flatMap((method) =>
                method.controllerFile ? [method.controllerFile] : [],
              ),
            ),
          ];
          for (const [type, path] of resolveLocalTypeLocations(
            controllerFiles,
            missingNonGenericRefsBeforeResolution,
          )) {
            resolvedNonGenericLocations.set(type, path);
          }

          // Fast grep-based resolution (much faster for large codebases)
          const tsconfigDir = dirname(tsconfig);
          const fastResolved = resolveTypeLocationsFast(
            tsconfigDir,
            new Set(
              [...missingNonGenericRefsBeforeResolution].filter(
                (type) => !resolvedNonGenericLocations.has(type),
              ),
            ),
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
            const morphResolved = resolveTypeLocations(
              project,
              unresolvedTypes,
            );

            for (const [type, path] of morphResolved) {
              resolvedNonGenericLocations.set(type, path);
            }
          }
        } else {
          yield* Effect.annotateCurrentSpan(
            'unresolvedTypeCountAfterFastLookup',
            0,
          );
        }
        yield* Effect.annotateCurrentSpan(
          'resolvedTypeLocationCount',
          resolvedNonGenericLocations.size,
        );

        if (resolvedNonGenericLocations.size > 0) {
          const additionalFiles = [
            ...new Set(resolvedNonGenericLocations.values()),
          ];
          for (const filePath of additionalFiles)
            schemaSourceFiles.add(filePath);

          const additionalSchemas = yield* generateNamedSchemas(
            resolvedNonGenericLocations,
            tsconfig,
          );

          if (Object.keys(additionalSchemas.definitions).length > 0) {
            const normalizedAdditional =
              yield* normalizeStructureRefsEffect(additionalSchemas);

            const combinedSchemas: GeneratedSchemas = {
              definitions: {
                ...generatedSchemas.definitions,
                ...normalizedAdditional.definitions,
                // Keep schemas generated from their planned declarations
                ...Object.fromEntries(
                  [...plannedSources.keys()].flatMap((name) => {
                    const schema = generatedSchemas.definitions[name];
                    return schema ? [[name, schema]] : [];
                  }),
                ),
              },
            };
            generatedSchemas = combinedSchemas;

            mergeResult = yield* mergeSchemasEffect(
              paths as unknown as OpenApiSpec['paths'],
              combinedSchemas,
              extraModelRoots,
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
          for (const filePath of resolvedGenericSymbols.values()) {
            schemaSourceFiles.add(filePath);
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
              extraModelRoots,
            );
            schemas = mergeResult.schemas;
            yield* Effect.annotateCurrentSpan(
              'schemaCountAfterGenericResolution',
              Object.keys(schemas).length,
            );
          }
        }
      }

      // Overlay class metadata once every schema is known, so types resolved
      // outside dtoGlob get theirs too
      const shouldExtractValidation = options.extractValidation !== false;
      yield* Effect.annotateCurrentSpan(
        'validationExtractionEnabled',
        shouldExtractValidation ? 'true' : 'false',
      );
      if (Object.keys(generatedSchemas.definitions).length > 0) {
        generatedSchemas = yield* overlayClassMetadataEffect(
          [...schemaSourceFiles],
          tsconfig,
          generatedSchemas,
          plannedSources,
          expansion,
          shouldExtractValidation,
          schemaNaming,
          namedEnums,
        );
        mergeResult = yield* mergeSchemasEffect(
          paths as unknown as OpenApiSpec['paths'],
          generatedSchemas,
          extraModelRoots,
        );
        schemas = mergeResult.schemas;
      }
    }

    // 'nest' enums: values are written in place unless `enumName` names them
    if (enumStyle === 'nest') {
      const enumComponents = new Set(
        Object.entries(schemas).flatMap(([name, schema]) =>
          isEnumOnlySchema(schema) && !namedEnums.has(name) ? [name] : [],
        ),
      );
      const inlined = inlineSchemas(
        paths as OpenApiPaths,
        schemas,
        enumComponents,
      );
      paths = inlined.paths as typeof paths;
      schemas = inlined.schemas;
    }

    // 'inline' collision strategy: colliding schemas are written in place
    const inlineNames = collisionInlinedNames(
      Object.keys(schemas),
      schemaNamePlan,
    );
    if (inlineNames.size > 0) {
      const inlined = inlineSchemas(
        paths as OpenApiPaths,
        schemas,
        inlineNames,
      );
      paths = inlined.paths as typeof paths;
      schemas = inlined.schemas;
      for (const name of inlined.kept) {
        yield* Effect.logWarning(
          `Schema "${name}" refers to itself and cannot be inlined; it stays a component under its file-based name`,
        );
      }
    }

    if (aliasRefsMode === 'collapse' && Object.keys(schemas).length > 0) {
      const collapsed = collapseAliasRefs(paths as OpenApiPaths, schemas);
      paths = collapsed.paths as typeof paths;
      schemas = collapsed.schemas;
    }
    yield* Effect.annotateCurrentSpan('aliasRefMode', aliasRefsMode);

    // Get OpenAPI version from config (default to 3.0.3)
    const openApiVersion = openapi.version ?? '3.0.3';
    yield* Effect.annotateCurrentSpan('openApiVersion', openApiVersion);

    // Component names must match ^[a-zA-Z0-9._-]+$; generic instantiations
    // such as `Page<User>` become `Page_User` unless raw names are asked for
    if ((options.schemas?.genericNames ?? 'sanitized') === 'sanitized') {
      const sanitized = sanitizeComponentNames(paths as OpenApiPaths, schemas);
      paths = sanitized.paths as typeof paths;
      schemas = sanitized.schemas;
    }

    // `examples` in schemas: 3.0 has only `example`, 3.1 wants an array
    const adapted = adaptExamplesForVersion(
      paths as OpenApiPaths,
      schemas,
      openApiVersion,
    );
    paths = adapted.paths as typeof paths;
    schemas = adapted.schemas;

    // `const` is JSON Schema, and OpenAPI only adopted it in 3.1. For 3.0.3,
    // rewrite it as a single-value `enum`, which that version understands.
    schemas = expandConstSchemas(schemas, openApiVersion);

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
    yield* Effect.annotateCurrentSpan(
      'validationTotalRefCount',
      validation.totalRefs,
    );
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
  },
  Effect.ensuring(
    Effect.sync(() => {
      clearSchemaProgramCache();
      clearRunProjects();
    }),
  ),
);

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
