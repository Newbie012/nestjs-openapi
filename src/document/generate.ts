/**
 * The generation pipeline: collects operations and schemas from the source,
 * normalizes and merges them into one document, adapts it to the requested
 * OpenAPI version and writes it, with a Promise wrapper around the Effect.
 */

import { Effect } from 'effect';
import { appendFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { Project, ts, type ClassDeclaration } from 'ts-morph';
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
import {
  findMissingIncludes,
  getDocumentedControllerModules,
  type ModuleScope,
} from '../analysis/modules.js';
import {
  getControllerMethodInfos,
  type ExtractParametersOptions,
} from '../analysis/methods.js';
import { toOpenApiPath, transformMethods } from './transformer.js';
import {
  generateNamedSchemas,
  generateSchemas,
  generateSchemasFromVirtualFile,
  type GeneratedSchemas,
  type JsonSchema,
} from '../schema/schema-generator.js';
import { normalizeStructureRefs } from '../schema/schema-normalizer.js';
import { collapseAliasRefs } from '../schema/schema-alias-collapser.js';
import { OPERATION_KEYS } from '../schema/schema-walk.js';
import {
  forbidAdditionalProperties,
  mergeSchemas,
  reachableSchemaNames,
} from '../schema/schema-merger.js';
import { filterMethods } from '../analysis/filter.js';
import {
  transformSpecForVersion,
  adaptSpecForV30,
  emptyNonOAuthScopesForV30,
} from '../schema/schema-version-transformer.js';
import { ConfigService } from '../config/config.js';
import {
  validateSpec,
  validateStructure,
  type ValidationResult,
} from './spec-validator.js';
import { runGeneratorApiPromise } from '../public-api.js';
import {
  createTypeResolverProject,
  resolveTypeLocations,
  resolveLocalTypeLocations,
  resolveTypeLocationsFast,
} from '../schema/type-resolver.js';
import {
  extractClassValidationInfoEffect,
  mergeValidationConstraints,
  type ValidationConstraints,
} from '../analysis/validation-mapper.js';
import { runtimeLayerFor } from '../runtime/runtime-layer.js';
import { generatorServicesLayer } from '../runtime/service-layer.js';
import {
  EMPTY_PLAN,
  applyPlanToMethods,
  namingForPlan,
  planSchemaNames,
  singleDeclarationSources,
  regenerateDeclarations,
} from '../schema/schema-identity.js';
import {
  resolveSchemaNames,
  type EnumNameClash,
} from '../schema/schema-name-resolution.js';
import { declarationKey } from '../analysis/declaration-references.js';
import { inlineSchemas } from '../schema/schema-inliner.js';
import type { DeclarationRef } from '../model/domain.js';
import {
  DEFAULT_ENUM_STYLE,
  NAMED_ENUM_REF,
  type SchemaNaming,
} from '../analysis/property-schema.js';
import {
  readDecoratorUses,
  type DecoratorExpansionOptions,
} from '../analysis/decorators.js';
import { clearSchemaProgramCache } from '../schema/schema-program.js';
import {
  adaptExamplesForVersion,
  sanitizeComponentNames,
} from '../schema/spec-compliance.js';
import type { MethodInfo, ResolvedParameter } from '../model/domain.js';
import type { OverlayDocument, PathTransform } from '../config/types.js';
import { clearRunProjects, getRunProject } from '../analysis/run-project.js';
import {
  applyMappedTypes,
  collectMappedTypeBases,
  getMappedTypeBase,
} from '../analysis/mapped-types.js';
import { OutputService } from './output-service.js';
import { applyOperationExtensions } from './operation-extensions.js';
import { applyOverlay } from './overlay.js';

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
    return paths;
  }

  const mergedPaths: MutablePaths = {};

  for (const [path, methods] of Object.entries(paths)) {
    const mergedMethods: MutablePaths[string] = {};

    for (const [method, operation] of Object.entries(methods)) {
      if (operation.security && operation.security.length > 0) {
        const operationSecurity = operation.security;
        mergedMethods[method] = {
          ...operation,
          security: globalSecurity.flatMap((globalReq) =>
            operationSecurity.map((operationReq) =>
              mergeSingleSecurityRequirement(globalReq, operationReq),
            ),
          ),
        };
      } else {
        mergedMethods[method] = operation;
      }
    }

    mergedPaths[path] = mergedMethods;
  }

  return mergedPaths;
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

type KeyContext =
  | 'root'
  | 'paths'
  | 'pathItem'
  | 'components'
  | 'schemas'
  | 'schema'
  | 'properties'
  | 'value'
  | 'other';

const SCHEMA_CHILD_KEYS = new Set([
  'items',
  'additionalProperties',
  'not',
  'allOf',
  'anyOf',
  'oneOf',
  'prefixItems',
  'contains',
  'propertyNames',
  'if',
  'then',
  'else',
  'unevaluatedItems',
  'unevaluatedProperties',
]);

const VALUE_KEYS = new Set(['example', 'examples', 'default', 'enum', 'const']);

const childContext = (parent: KeyContext, key: string): KeyContext => {
  if (parent === 'value') return 'value';
  if (parent === 'root') {
    if (key === 'paths') return 'paths';
    if (key === 'components') return 'components';
    return 'other';
  }
  if (parent === 'paths') return 'pathItem';
  if (parent === 'components') return key === 'schemas' ? 'schemas' : 'other';
  if (parent === 'schemas' || parent === 'properties') return 'schema';
  if (parent === 'schema') {
    if (key === 'properties') return 'properties';
    if (VALUE_KEYS.has(key)) return 'value';
    if (SCHEMA_CHILD_KEYS.has(key)) return 'schema';
    return 'other';
  }
  if (VALUE_KEYS.has(key)) return 'value';
  if (key === 'schema') return 'schema';
  return 'other';
};

const KEEPS_SOURCE_ORDER: ReadonlySet<KeyContext> = new Set([
  'paths',
  'pathItem',
  'properties',
]);

/**
 * Recursively order object keys.
 * - Top-level OpenAPI fields are ordered per spec convention
 * - With `'alphabetical'`, every other object is sorted A to Z
 * - With `'source'`, paths, the operations of a path item and schema
 *   properties keep the order they were built in; every other object is
 *   still sorted A to Z
 */
const orderObjectKeysDeep = <T>(
  obj: T,
  order: 'source' | 'alphabetical',
  context: KeyContext = 'root',
): T => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) =>
      orderObjectKeysDeep(item, order, context === 'value' ? 'value' : 'other'),
    ) as T;
  }

  const ordered: Record<string, unknown> = {};
  const objRecord = obj as Record<string, unknown>;
  const keys = Object.keys(objRecord);

  const orderedKeys =
    context === 'root'
      ? keys.sort((a, b) => {
          const aIndex = OPENAPI_FIELD_ORDER.indexOf(a);
          const bIndex = OPENAPI_FIELD_ORDER.indexOf(b);
          if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
          if (aIndex !== -1) return -1;
          if (bIndex !== -1) return 1;
          return a.localeCompare(b);
        })
      : order === 'source' && KEEPS_SOURCE_ORDER.has(context)
        ? keys
        : keys.sort();

  for (const key of orderedKeys) {
    ordered[key] = orderObjectKeysDeep(
      objRecord[key],
      order,
      childContext(context, key),
    );
  }

  return ordered as T;
};

const REF_PREFIX = '#/components/schemas/';

/**
 * Orders `components.schemas` by first reach: walking the ordered paths, then
 * each schema as it is reached, in document order. Schemas nothing reaches
 * follow, A to Z.
 */
const orderSchemasByReach = (spec: OpenApiSpec): OpenApiSpec => {
  const schemas = spec.components?.schemas;
  if (!schemas) return spec;
  const reached = new Set<string>();
  const visit = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (
        key === '$ref' &&
        typeof value === 'string' &&
        value.startsWith(REF_PREFIX)
      ) {
        const name = value.slice(REF_PREFIX.length);
        if (name in schemas && !reached.has(name)) {
          reached.add(name);
          visit(schemas[name]);
        }
      } else {
        visit(value);
      }
    }
  };
  visit(spec.paths);
  const names = [
    ...reached,
    ...Object.keys(schemas).filter((name) => !reached.has(name)),
  ];
  return {
    ...spec,
    components: {
      ...spec.components,
      schemas: Object.fromEntries(names.map((name) => [name, schemas[name]!])),
    },
  };
};

/**
 * Adds schemas found after the first round, normalized on their own. They
 * win over the schemas found before, except where `kept` names a schema
 * that is already there (one generated from its planned declaration).
 */
const withLaterSource = (
  schemas: GeneratedSchemas,
  source: GeneratedSchemas,
  kept: ReadonlyMap<string, unknown> = new Map(),
): GeneratedSchemas => ({
  definitions: {
    ...schemas.definitions,
    ...Object.fromEntries(
      Object.entries(normalizeStructureRefs(source).definitions).filter(
        ([name]) => !(kept.has(name) && schemas.definitions[name]),
      ),
    ),
  },
});

/**
 * Find all schema refs in paths that aren't among the `defined` names.
 * Returns a set of missing schema names.
 */
const findMissingSchemaRefs = (
  paths: OpenApiSpec['paths'],
  defined: ReadonlySet<string>,
): Set<string> => {
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

const parseTypeRef = (
  typeRef: string,
): { identifiers: Set<string>; unqualified: string } => {
  const prefix = 'type __Ref = ';
  const source = ts.createSourceFile(
    'type-ref.ts',
    `${prefix}${typeRef};`,
    ts.ScriptTarget.Latest,
  );
  const names = new Set<string>();
  const qualifiers: Array<{ start: number; end: number }> = [];
  const visit = (node: ts.Node): void => {
    if (ts.isTypeReferenceNode(node) && ts.isQualifiedName(node.typeName)) {
      names.add(node.typeName.right.text);
      qualifiers.push({
        start: node.typeName.getStart(source),
        end: node.typeName.right.getStart(source),
      });
    } else if (
      ts.isTypeReferenceNode(node) ||
      ts.isExpressionWithTypeArguments(node)
    ) {
      let name: ts.Node = ts.isTypeReferenceNode(node)
        ? node.typeName
        : node.expression;
      while (ts.isPropertyAccessExpression(name)) name = name.expression;
      if (ts.isIdentifier(name)) names.add(name.text);
    }
    if (ts.isTypeQueryNode(node)) {
      let name: ts.Node = node.exprName;
      while (ts.isQualifiedName(name)) name = name.left;
      if (ts.isIdentifier(name)) names.add(name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  let unqualified = typeRef;
  for (const { start, end } of qualifiers.sort((a, b) => b.start - a.start)) {
    unqualified =
      unqualified.slice(0, start - prefix.length) +
      unqualified.slice(end - prefix.length);
  }

  return {
    identifiers: new Set(
      [...names].filter((name) => !NON_IMPORTABLE_TYPE_NAMES.has(name)),
    ),
    unqualified,
  };
};

/**
 * The declarations a type reference needs imported. A namespace-qualified
 * argument such as `Dtos.UserDto` names the declaration on its right, since
 * the namespace import itself declares nothing to look up.
 */
const extractTypeIdentifiers = (typeRef: string): Set<string> =>
  parseTypeRef(typeRef).identifiers;

const toModuleImportPath = (fromDir: string, filePath: string): string => {
  const importPath = relative(fromDir, filePath).replace(/\\/g, '/');
  return importPath.startsWith('.') ? importPath : `./${importPath}`;
};

/**
 * Finds the file that declares each symbol by name: the controller files
 * first, as TypeScript resolves a local declaration before an import, then
 * a text search of the project, then a ts-morph project for the rest.
 */
const spikeStages = new Map<string, string>();

/**
 * Spike instrumentation: appends one JSON line per missing ref to the file
 * named by `NOA_SPIKE_LOG`.
 */
const spikeLogMissing = (
  tsconfig: string,
  missing: ReadonlySet<string>,
  finalMissing: ReadonlySet<string>,
  locations: ReadonlyMap<string, string>,
  methods: readonly MethodInfo[],
  phase: string,
) => {
  const target = process.env.NOA_SPIKE_LOG;
  if (!target) return;
  for (const name of missing) {
    const base = name.replace(/<.*>$/, '');
    const declared = methods.flatMap((method) =>
      (method.referencedDeclarations ?? [])
        .filter((ref) => ref.name === base || ref.localNames?.includes(base))
        .map((ref) => ({
          name: ref.name,
          filePath: ref.filePath,
          kind: ref.kind,
          generic: ref.generic ?? false,
          localNames: ref.localNames,
        })),
    );
    const usedBy = methods
      .filter((method) =>
        JSON.stringify(method.returnType ?? {}).includes(base),
      )
      .map((method) => ({
        route: `${method.httpMethod} ${method.path}`,
        returnType: method.returnType,
      }))
      .slice(0, 3);
    appendFileSync(
      target,
      `${JSON.stringify({
        phase,
        tsconfig,
        name,
        generic: isGenericSchemaRef(name),
        stage: finalMissing.has(name)
          ? 'never'
          : (spikeStages.get(name) ??
            (isGenericSchemaRef(name) ? 'generic-round' : 'unknown')),
        resolvedFile: locations.get(name),
        declared,
        usedBy,
      })}\n`,
    );
  }
};

const resolveSymbolLocations = (
  tsconfig: string,
  controllerFiles: readonly string[],
  symbolNames: ReadonlySet<string>,
): Map<string, string> => {
  if (symbolNames.size === 0) {
    return new Map();
  }

  const resolved = resolveLocalTypeLocations(controllerFiles, symbolNames);
  for (const name of resolved.keys()) spikeStages.set(name, 'local');
  const unresolvedNames = () =>
    new Set([...symbolNames].filter((name) => !resolved.has(name)));

  for (const [name, filePath] of resolveTypeLocationsFast(
    dirname(tsconfig),
    unresolvedNames(),
  )) {
    resolved.set(name, filePath);
    spikeStages.set(name, 'rg');
  }

  const unresolved = unresolvedNames();
  if (unresolved.size > 0) {
    const project = createTypeResolverProject(tsconfig);
    for (const [name, filePath] of resolveTypeLocations(project, unresolved)) {
      resolved.set(name, filePath);
      spikeStages.set(name, 'ts-morph');
    }
  }
  if (process.env.NOA_SPIKE_LOG) {
    appendFileSync(
      process.env.NOA_SPIKE_LOG,
      `${JSON.stringify({
        phase: 'lookup',
        tsconfig,
        names: [...symbolNames].map((name) => ({
          name,
          stage: spikeStages.get(name) ?? 'never',
          filePath: resolved.get(name),
        })),
      })}\n`,
    );
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

const generatedTargetName = (schema: unknown): string | undefined => {
  if (!schema || typeof schema !== 'object') return undefined;
  const { $ref, ...rest } = schema as Record<string, unknown>;
  return typeof $ref === 'string' &&
    $ref.startsWith('#/definitions/') &&
    Object.keys(rest).length === 0
    ? decodeURIComponent($ref.slice('#/definitions/'.length))
    : undefined;
};

const isAnonymousInstantiation = (name: string): boolean => {
  if (!isGenericSchemaRef(name)) return false;
  const source = ts.createSourceFile(
    'type-ref.ts',
    `type __Ref = ${name};`,
    ts.ScriptTarget.Latest,
  );
  const hasTypeLiteral = (node: ts.Node): boolean =>
    ts.isTypeLiteralNode(node) ||
    ts.forEachChild(node, hasTypeLiteral) === true;
  return hasTypeLiteral(source);
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
    aliasLines.push(
      `export type ${aliasName} = ${parseTypeRef(genericRef).unqualified};`,
    );
  }

  if (aliases.length === 0) {
    return { definitions: {} };
  }

  const tsconfigDir = dirname(tsconfig);
  const virtualFilePath = join(tsconfigDir, '.openapi.missing-generic.ts');

  const importLines = [...importGroups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([filePath, symbols]) => {
      const importPath = toModuleImportPath(tsconfigDir, filePath);
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
    const target = generatedTargetName(resolvedSchema);
    if (target !== undefined && target !== schemaName) {
      const body = generated.definitions[target];
      if (body) {
        generated.definitions[schemaName] = body;
        delete generated.definitions[target];
      }
    } else if (resolvedSchema) {
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

  return [...new Set(fileArrays.flat())];
});

export const indexSchemaClasses = (
  project: Project,
  sourceFiles: ReadonlySet<string>,
  schemaNames: ReadonlySet<string>,
  plannedSources: ReadonlyMap<string, DeclarationRef>,
) => {
  const index = new Map<string, ClassDeclaration>();
  const schemaFileFirst = (filePath: string) =>
    sourceFiles.has(filePath) ? 0 : 1;

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
        schemaFileFirst(filePath) <
          schemaFileFirst(current.getSourceFile().getFilePath())
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
  ) {
    if (sourceFilePaths.length === 0) {
      return { schemas: inputSchemas, enumNameUses: [] };
    }

    const project = getRunProject(tsconfig);

    project.addSourceFilesAtPaths([...sourceFilePaths]);
    project.resolveSourceFileDependencies();

    let schemas = inputSchemas;
    const classes = indexSchemaClasses(
      project,
      new Set(sourceFilePaths),
      new Set(Object.keys(schemas.definitions)),
      plannedSources,
    );

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
      const normalizedBases = normalizeStructureRefs(generatedBases);
      schemas = {
        definitions: {
          ...normalizedBases.definitions,
          ...schemas.definitions,
        },
      };
      for (const [name, decl] of missingBases) classes.set(name, decl);
    }

    const validated = withValidation
      ? yield* overlayValidationConstraintsEffect(
          classes,
          schemas,
          expansion,
          naming,
        )
      : { schemas, enumNameUses: [] };

    const composed = applyMappedTypes(
      validated.schemas,
      classes,
      naming.componentName,
    );
    return {
      schemas:
        naming.enums === 'ref' ? composed : inlineInferredEnumRefs(composed),
      enumNameUses: validated.enumNameUses,
    };
  },
);

/**
 * 'nest' enum style, refs inside definitions: as @nestjs/swagger does, a ref
 * to an enum inferred from a TypeScript type is written in place, while a ref
 * that carries NAMED_ENUM_REF (an `enumName`) stays. Decided per ref, so the
 * same component can be inlined at one property and kept at another. Refs in
 * paths are left to `inlineUnnamedEnums`.
 */
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
 * 'nest' enum style, paths and merged components: every enum-only component
 * that no `enumName` names is written in place and removed. Decided per
 * component name, after the merge, where the NAMED_ENUM_REF marker read by
 * `inlineInferredEnumRefs` is gone.
 */
const inlineUnnamedEnums = (
  paths: OpenApiPaths,
  schemas: Record<string, OpenApiSchema>,
  enumNameUses: readonly EnumNameUse[],
) => {
  const named = new Set(enumNameUses.map((use) => use.name));
  return inlineSchemas(
    paths,
    schemas,
    new Set(
      Object.entries(schemas).flatMap(([name, schema]) =>
        isEnumOnlySchema(schema) && !named.has(name) ? [name] : [],
      ),
    ),
  );
};

type EnumNameUse = {
  readonly name: string;
  readonly className: string;
  readonly property: string;
  readonly schema: JsonSchema;
};

const sameEnumValues = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((value) => b.includes(value));

const inlineRef = (value: unknown, ref: string, schema: unknown): unknown => {
  if (Array.isArray(value))
    return value.map((item) => inlineRef(item, ref, schema));
  if (!value || typeof value !== 'object') return value;
  const { $ref, ...rest } = value as Record<string, unknown>;
  if ($ref === ref) return { ...(schema as object), ...rest };
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      inlineRef(item, ref, schema),
    ]),
  );
};

const separateEnumNameClashes = (
  paths: OpenApiPaths,
  schemas: Record<string, OpenApiSchema>,
  uses: readonly EnumNameUse[],
) => {
  const byName = new Map<string, EnumNameUse[]>();
  for (const use of uses) {
    if (!schemas[use.className]) continue;
    byName.set(use.name, [...(byName.get(use.name) ?? []), use]);
  }
  const clashes: EnumNameClash[] = [];
  let result = schemas;
  for (const [name, named] of byName) {
    const values: unknown[][] = [];
    for (const use of named) {
      const enumValues = (use.schema['enum'] as unknown[] | undefined) ?? [];
      if (!values.some((other) => sameEnumValues(other, enumValues))) {
        values.push(enumValues);
      }
    }
    if (values.length < 2) continue;
    clashes.push({ name, values });
    const ref = `#/components/schemas/${name}`;
    result = { ...result };
    for (const use of named) {
      const owner = result[use.className]!;
      const property = owner.properties?.[use.property];
      if (!property) continue;
      result[use.className] = {
        ...owner,
        properties: {
          ...owner.properties,
          [use.property]: inlineRef(property, ref, use.schema) as OpenApiSchema,
        },
      };
    }
    const { [name]: _named, ...others } = result;
    if (!JSON.stringify([paths, others]).includes(`"${ref}"`)) result = others;
  }
  return { schemas: result, clashes };
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
) {
  const classConstraints = new Map<
    string,
    Record<string, ValidationConstraints>
  >();
  const classRequired = new Map<string, readonly string[]>();
  const classOptional = new Map<string, readonly string[]>();

  for (const [className, classDecl] of classes) {
    const { constraints, required, optional, unreadable } =
      yield* extractClassValidationInfoEffect(classDecl, expansion, naming);

    for (const note of unreadable ?? []) {
      yield* Effect.logWarning(note);
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

  const enumNameUses: readonly EnumNameUse[] = [...classConstraints].flatMap(
    ([className, properties]) =>
      Object.entries(properties).flatMap(([property, { enumComponent }]) =>
        enumComponent
          ? [
              {
                name: enumComponent.name,
                className,
                property,
                schema: enumComponent.schema,
              },
            ]
          : [],
      ),
  );

  yield* Effect.logDebug('Validation extraction complete').pipe(
    Effect.annotateLogs({
      classes: classes.size,
      constrainedClasses: classConstraints.size,
      classesWithRequired: classRequired.size,
    }),
  );

  return {
    schemas: mergeValidationConstraints(
      schemas,
      classConstraints,
      classRequired,
      classOptional,
    ),
    enumNameUses,
  };
});

const finalizePath = (
  method: MethodInfo,
  basePath: string | undefined,
  transformPath: PathTransform | undefined,
) => {
  const prefix = basePath ? `/${basePath.replace(/^\/+|\/+$/g, '')}` : '';
  const joined =
    method.path === '/' && prefix ? prefix : `${prefix}${method.path}`;
  const path = toOpenApiPath(joined);
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

const withSource = (
  infos: readonly MethodInfo[],
  controller: ClassDeclaration,
  module: ClassDeclaration,
  entry: string,
): readonly MethodInfo[] => {
  const controllerDecorators = readDecoratorUses(controller);
  return infos.map((info) => {
    const method = controller.getMethod(info.methodName);
    return {
      ...info,
      source: {
        entry,
        module: module.getName() ?? '',
        methodDecorators: method ? readDecoratorUses(method) : [],
        controllerDecorators,
      },
    };
  });
};

/**
 * Internal Effect-based logic to extract method infos from a single entry
 */
const extractMethodInfosFromEntry = Effect.fn(
  'Generate.extractMethodInfosFromEntry',
)(function* (
  tsconfig: string,
  entry: string,
  extractOptions: ExtractParametersOptions = {},
  scope: ModuleScope = {},
  entryAsConfigured?: string,
) {
  const project = getRunProject(tsconfig);

  project.addSourceFilesAtPaths(entry);

  const entrySourceFile = project.getSourceFile(entry);
  if (!entrySourceFile) {
    return yield* EntryNotFoundError.fileNotFound(entry);
  }

  let entryClass = entrySourceFile.getClass('AppModule');
  if (!entryClass) {
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
    return yield* EntryNotFoundError.classNotFound(entry, 'Module');
  }

  const controllers = yield* getDocumentedControllerModules(entryClass, scope);

  const methodInfos = controllers.map(({ controller, module }) => {
    const infos = getControllerMethodInfos(controller, extractOptions);
    return entryAsConfigured === undefined
      ? infos
      : withSource(infos, controller, module, entryAsConfigured);
  });

  return {
    methodInfos: methodInfos.flat(),
    missingIncludes: findMissingIncludes(entryClass, scope.include ?? []),
  };
});

/**
 * Internal Effect-based logic to extract method infos from multiple entries
 */
const extractMethodInfosEffect = Effect.fn('Generate.extractMethodInfos')(
  function* (
    tsconfig: string,
    entries: readonly string[],
    extractOptions: ExtractParametersOptions,
    scope: ModuleScope,
    sourceEntries?: readonly string[],
  ) {
    const fromEntries = yield* Effect.forEach(
      entries,
      (entry, index) =>
        extractMethodInfosFromEntry(
          tsconfig,
          entry,
          extractOptions,
          scope,
          sourceEntries?.[index],
        ),
      { concurrency: 'unbounded' },
    );

    const missingInEveryEntry = (scope.include ?? []).filter((name) =>
      fromEntries.every(({ missingIncludes }) =>
        missingIncludes.includes(name),
      ),
    );
    if (missingInEveryEntry.length > 0) {
      yield* Effect.logWarning(
        'Modules listed in options.include were not found in the module graph',
      ).pipe(Effect.annotateLogs({ modules: missingInEveryEntry.join(', ') }));
    }

    const allMethodInfos = fromEntries.map(({ methodInfos }) => methodInfos);

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

const resetRunCaches = (): void => {
  clearSchemaProgramCache();
  clearRunProjects();
};

/**
 * Canonical Effect-native generation pipeline.
 */
export const generateEffect = Effect.fn('Generate.generateEffect')(
  function* (configPath: string, overrides?: GenerateOverrides) {
    const absoluteConfigPath = resolve(configPath);
    const configDir = dirname(absoluteConfigPath);

    resetRunCaches();

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
    const configEntries: readonly string[] = Array.isArray(rawEntry)
      ? rawEntry
      : [rawEntry];
    const entries = configEntries.map((e) => resolve(configDir, e));
    const output = resolve(configDir, config.output);

    const tsconfig = yield* resolveTsconfigForGenerate(
      files.tsconfig,
      configDir,
      entries,
      absoluteConfigPath,
    );

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

    const [extractedMethodInfos, initialSchemas] = yield* Effect.all(
      [
        extractMethodInfosEffect(
          tsconfig,
          entries,
          extractOptions,
          {
            include: options.include,
            deepScanRoutes: options.deepScanRoutes,
          },
          options.operationExtensions ? configEntries : undefined,
        ).pipe(
          Effect.tap((methods) =>
            Effect.logDebug('Method extraction complete').pipe(
              Effect.annotateLogs({ methodCount: methods.length, entries }),
            ),
          ),
        ),
        generateSchemas({
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

    const filteredMethodInfos = filterMethods(extractedMethodInfos, {
      excludeDecorators: options.excludeDecorators,
      pathFilter: options.pathFilter,
    });

    const dtoFiles = yield* resolveDtoFilesEffect(dtoGlobArray, configDir);
    const schemaNamePlan = initialSchemas
      ? planSchemaNames(filteredMethodInfos, dtoFiles, configDir)
      : EMPTY_PLAN;
    const documentedMethods = applyPlanToMethods(
      filteredMethodInfos,
      schemaNamePlan,
    );
    const extraModelRoots = [
      ...new Set(
        documentedMethods.flatMap((method) => method.extraModels ?? []),
      ),
    ];
    const enumStyle = options.enums ?? DEFAULT_ENUM_STYLE;
    const schemaNaming = namingForPlan(schemaNamePlan, enumStyle);

    const routedMethods: MethodInfo[] = [];
    for (const method of documentedMethods) {
      const path = finalizePath(
        method,
        options.basePath,
        options.transformPath,
      );
      const templated = new Set(
        [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]),
      );
      const isUnrouted = (parameter: ResolvedParameter) =>
        parameter.location === 'path' && !templated.has(parameter.name);
      for (const parameter of method.parameters.filter(isUnrouted)) {
        yield* Effect.logWarning(
          `${method.httpMethod} ${path}: path parameter "${parameter.name}" is not in the route and is left out`,
        );
      }
      routedMethods.push({
        ...method,
        path,
        parameters: method.parameters.filter(
          (parameter) => !isUnrouted(parameter),
        ),
      });
    }

    let paths = transformMethods(routedMethods);
    if (options.operationExtensions) {
      paths = yield* applyOperationExtensions(
        paths,
        routedMethods,
        options.operationExtensions,
      );
    }

    paths = mergeSecurityWithGlobal(paths, security.global);

    let schemas: Record<string, OpenApiSchema> = {};
    let enumNameUses: readonly EnumNameUse[] = [];

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

      const schemaSourceFiles = new Set<string>(dtoFiles);

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
        const reachedSchemas = normalizeStructureRefs(
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

      generatedSchemas = normalizeStructureRefs(generatedSchemas);

      const spikeLastLocations = new Map<string, string>();
      spikeStages.clear();
      const missingRefs = findMissingSchemaRefs(
        paths,
        reachableSchemaNames(paths, generatedSchemas, extraModelRoots),
      );
      const missingNonGenericRefsBeforeResolution = new Set(
        [...missingRefs].filter((ref) => !isGenericSchemaRef(ref)),
      );

      if (missingRefs.size > 0) {
        const controllerFiles = [
          ...new Set(
            filteredMethodInfos.flatMap((method) =>
              method.controllerFile ? [method.controllerFile] : [],
            ),
          ),
        ];
        const resolvedNonGenericLocations = resolveSymbolLocations(
          tsconfig,
          controllerFiles,
          missingNonGenericRefsBeforeResolution,
        );

        for (const [name, filePath] of resolvedNonGenericLocations) {
          spikeLastLocations.set(name, filePath);
        }
        if (resolvedNonGenericLocations.size > 0) {
          const additionalFiles = [
            ...new Set(resolvedNonGenericLocations.values()),
          ];
          for (const filePath of additionalFiles)
            schemaSourceFiles.add(filePath);

          generatedSchemas = withLaterSource(
            generatedSchemas,
            yield* generateNamedSchemas(resolvedNonGenericLocations, tsconfig),
            plannedSources,
          );
        }

        const unresolvedAfterFileResolution = findMissingSchemaRefs(
          paths,
          reachableSchemaNames(paths, generatedSchemas, extraModelRoots),
        );
        const unresolvedGenericRefs = [...unresolvedAfterFileResolution].filter(
          isGenericSchemaRef,
        );

        if (unresolvedGenericRefs.length > 0) {
          const genericSymbols = new Set<string>();
          for (const ref of unresolvedGenericRefs) {
            for (const symbol of extractTypeIdentifiers(ref)) {
              genericSymbols.add(symbol);
            }
          }

          const reachedLocations = new Map<string, string>();
          for (const method of filteredMethodInfos) {
            for (const ref of method.referencedDeclarations ?? []) {
              if (
                genericSymbols.has(ref.name) &&
                !reachedLocations.has(ref.name)
              ) {
                reachedLocations.set(ref.name, ref.filePath);
              }
            }
          }
          const spikeByName = new Set(
            [...genericSymbols].filter((name) => !reachedLocations.has(name)),
          );
          if (process.env.NOA_SPIKE_LOG) {
            appendFileSync(
              process.env.NOA_SPIKE_LOG,
              `${JSON.stringify({
                phase: 'generic-symbols',
                tsconfig,
                fromDeclarations: [...reachedLocations.keys()],
                byName: [...spikeByName],
              })}\n`,
            );
          }
          const resolvedGenericSymbols = new Map([
            ...resolveSymbolLocations(
              tsconfig,
              controllerFiles,
              new Set(
                [...genericSymbols].filter(
                  (name) => !reachedLocations.has(name),
                ),
              ),
            ),
            ...reachedLocations,
          ]);
          for (const [name, filePath] of resolvedNonGenericLocations) {
            resolvedGenericSymbols.set(name, filePath);
          }
          for (const filePath of resolvedGenericSymbols.values()) {
            schemaSourceFiles.add(filePath);
          }

          generatedSchemas = withLaterSource(
            generatedSchemas,
            yield* generateMissingGenericSchemasEffect(
              unresolvedGenericRefs,
              tsconfig,
              resolvedGenericSymbols,
            ),
          );
        }
      }

      spikeLogMissing(
        tsconfig,
        missingRefs,
        findMissingSchemaRefs(
          paths,
          reachableSchemaNames(paths, generatedSchemas, extraModelRoots),
        ),
        spikeLastLocations,
        filteredMethodInfos,
        'after-first-merge',
      );

      const shouldExtractValidation = options.extractValidation !== false;
      if (Object.keys(generatedSchemas.definitions).length > 0) {
        const overlaid = yield* overlayClassMetadataEffect(
          [...schemaSourceFiles],
          tsconfig,
          generatedSchemas,
          new Map([
            ...singleDeclarationSources(filteredMethodInfos, schemaNamePlan),
            ...plannedSources,
          ]),
          expansion,
          shouldExtractValidation,
          schemaNaming,
        );
        enumNameUses = overlaid.enumNameUses;
        schemas = mergeSchemas(
          paths,
          overlaid.schemas,
          extraModelRoots,
        ).schemas;
      }
    }

    if (enumStyle === 'nest') {
      const inlined = inlineUnnamedEnums(paths, schemas, enumNameUses);
      paths = inlined.paths;
      schemas = inlined.schemas;
    }

    const enumNames = separateEnumNameClashes(paths, schemas, enumNameUses);
    const resolvedNames = yield* resolveSchemaNames(
      paths,
      enumNames.schemas,
      schemaNamePlan,
      options.schemaNameCollision ?? 'inline',
      enumNames.clashes,
    );
    paths = resolvedNames.paths;
    schemas = resolvedNames.schemas;

    const inlineNames = new Set([
      ...resolvedNames.inline,
      ...Object.keys(schemas).filter(isAnonymousInstantiation),
    ]);
    if (inlineNames.size > 0) {
      const inlined = inlineSchemas(paths, schemas, inlineNames);
      paths = inlined.paths;
      schemas = inlined.schemas;
      for (const name of inlined.kept) {
        yield* Effect.logWarning(
          `Schema "${name}" refers to itself and cannot be inlined; it stays a component under its file-based name`,
        );
      }
    }

    if (aliasRefsMode === 'collapse' && Object.keys(schemas).length > 0) {
      const collapsed = collapseAliasRefs(paths, schemas);
      paths = collapsed.paths;
      schemas = collapsed.schemas;
    }

    const openApiVersion = openapi.version ?? '3.0.3';
    yield* Effect.annotateCurrentSpan('openApiVersion', openApiVersion);

    if ((options.schemas?.genericNames ?? 'sanitized') === 'sanitized') {
      const sanitized = sanitizeComponentNames(paths, schemas);
      paths = sanitized.paths;
      schemas = sanitized.schemas;
    }

    if (options.schemas?.additionalProperties === 'forbid') {
      schemas = forbidAdditionalProperties(schemas);
    }

    const adapted = adaptExamplesForVersion(paths, schemas, openApiVersion);
    paths = adapted.paths;
    schemas = adapted.schemas;

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
      paths: paths,
      ...(components && { components }),
      tags: openapi.tags ?? [],
      ...(security.global &&
        security.global.length > 0 && {
          security: security.global,
        }),
    };

    if (openApiVersion === '3.0.3') {
      const { spec: scoped, dropped } = emptyNonOAuthScopesForV30(
        adaptSpecForV30(spec),
      );
      spec = scoped;
      for (const { scheme, scopes } of dropped) {
        yield* Effect.logWarning(
          `Dropped scopes [${scopes.join(', ')}] from security scheme '${scheme}': OpenAPI 3.0 allows scopes only on OAuth2 and OpenID Connect schemes. Use openapi.version 3.1.0 or later to keep them.`,
        );
      }
    } else {
      spec = transformSpecForVersion(spec, openApiVersion);
    }

    if (options.overlay) {
      spec = yield* applyOverlay(
        spec,
        options.overlay as string | OverlayDocument,
        configDir,
        options.overlayUnmatchedTarget,
      );
    }

    const order = options.order ?? 'source';
    const keyOrdered = orderObjectKeysDeep(spec, order);
    const sortedSpec =
      order === 'source' ? orderSchemasByReach(keyOrdered) : keyOrdered;

    yield* OutputService.ensureOutputDirectory(output);

    const format = overrides?.format ?? config.format ?? 'json';
    const serializedSpec = yield* OutputService.serializeSpec(
      sortedSpec,
      output,
      format,
    );
    yield* OutputService.writeOutput(output, serializedSpec, format);

    const finalPaths = (sortedSpec.paths ?? {}) as Record<
      string,
      Record<string, unknown>
    >;
    const pathCount = Object.keys(finalPaths).length;
    const operationCount = Object.values(finalPaths).reduce(
      (acc, pathItem) =>
        acc +
        Object.keys(pathItem).filter((key) => OPERATION_KEYS.has(key)).length +
        Object.keys(pathItem.additionalOperations ?? {}).length,
      0,
    );
    const schemaCount = Object.keys(
      sortedSpec.components?.schemas ?? {},
    ).length;
    yield* Effect.annotateCurrentSpan('finalPathCount', pathCount);
    yield* Effect.annotateCurrentSpan('finalOperationCount', operationCount);
    yield* Effect.annotateCurrentSpan('finalSchemaCount', schemaCount);

    const refValidation = validateSpec(sortedSpec);
    const structuralErrors = yield* Effect.promise(() =>
      validateStructure(sortedSpec),
    );
    const validation: ValidationResult = {
      ...refValidation,
      valid: refValidation.valid && structuralErrors.length === 0,
      structuralErrors,
    };
    yield* Effect.annotateCurrentSpan(
      'validationStructuralErrorCount',
      structuralErrors.length,
    );
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
        structuralErrorCount: structuralErrors.length,
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
  Effect.ensuring(Effect.sync(resetRunCaches)),
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
