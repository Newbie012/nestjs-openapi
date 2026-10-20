import { Effect, Schema } from 'effect';
import { existsSync, statSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import {
  ConfigNotFoundError,
  ConfigLoadError,
  ConfigValidationError,
  type ConfigError,
} from './errors.js';
import {
  OpenApiGeneratorConfig,
  ResolvedConfig,
  type OutputFormat,
  type SecuritySchemeConfig,
} from '../model/domain.js';
import type { Config } from './types.js';

/**
 * Deep merge two objects. Child values take precedence over parent.
 * Arrays are replaced, not merged.
 */
const deepMerge = <T extends Record<string, unknown>>(
  parent: T,
  child: Partial<T>,
): T => {
  const result = { ...parent } as T;

  for (const key of Object.keys(child) as (keyof T)[]) {
    const childValue = child[key];
    const parentValue = parent[key];

    if (childValue === undefined) {
      continue;
    }

    if (
      childValue !== null &&
      typeof childValue === 'object' &&
      !Array.isArray(childValue) &&
      parentValue !== null &&
      typeof parentValue === 'object' &&
      !Array.isArray(parentValue)
    ) {
      // Recursively merge objects
      result[key] = deepMerge(
        parentValue as Record<string, unknown>,
        childValue as Record<string, unknown>,
      ) as T[keyof T];
    } else {
      // Replace value (including arrays)
      result[key] = childValue as T[keyof T];
    }
  }

  return result;
};

/**
 * Define configuration for OpenAPI generation.
 *
 * @example
 * ```typescript
 * export default defineConfig({
 *   output: 'openapi.json',
 *   files: { entry: 'src/app.module.ts' },
 *   openapi: { info: { title: 'My API', version: '1.0.0' } },
 * });
 * ```
 */
export function defineConfig(config: Config): Config {
  return config;
}

const CONFIG_FILE_NAMES = [
  'openapi.config.ts',
  'openapi.config.js',
  'openapi.config.mjs',
  'openapi.config.cjs',
] as const;

const DEFAULT_ENTRY = 'src/app.module.ts';

/**
 * Default glob patterns for auto-discovering schema files.
 * These patterns are relative to the entry file directory.
 */
const DEFAULT_DTO_GLOB = [
  '**/*.dto.ts',
  '**/*.entity.ts',
  '**/*.model.ts',
  '**/*.schema.ts',
] as const;

const DEFAULT_CONFIG = {
  files: {
    include: [] as string[],
    exclude: ['**/*.spec.ts', '**/*.test.ts', '**/node_modules/**'],
  },
  options: {
    excludeDecorators: ['ApiExcludeEndpoint', 'ApiExcludeController'],
    extractValidation: true,
    schemas: {
      aliasRefs: 'collapse' as const,
    },
  },
  format: 'json' as OutputFormat,
  openapi: {
    servers: [] as readonly { url: string; description?: string }[],
    tags: [] as readonly { name: string; description?: string }[],
    security: {
      schemes: [] as readonly SecuritySchemeConfig[],
      global: [] as readonly Record<string, readonly string[]>[],
    },
  },
} as const;

export const findConfigFile = Effect.fn('Config.findConfigFile')(function* (
  scanStartDir: string = process.cwd(),
) {
  let currentDir = resolve(scanStartDir);

  while (true) {
    for (const fileName of CONFIG_FILE_NAMES) {
      const configPath = resolve(currentDir, fileName);
      if (existsSync(configPath)) {
        return configPath;
      }
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return yield* ConfigNotFoundError.notFound(scanStartDir);
});

const validateConfig = (
  config: unknown,
  filePath: string,
): Effect.Effect<typeof OpenApiGeneratorConfig.Type, ConfigValidationError> =>
  Schema.decodeUnknown(OpenApiGeneratorConfig)(config).pipe(
    Effect.mapError((parseError) => {
      const issues = parseError.message
        .split('\n')
        .filter((line) => line.trim());
      return ConfigValidationError.fromIssues(filePath, issues);
    }),
  );

/**
 * Unwrap nested default export if tsx loader double-wrapped it.
 * tsx sometimes produces: module.default = { default: actualConfig }
 */
const unwrapTsxDoubleDefault = (value: unknown): unknown =>
  value &&
  typeof value === 'object' &&
  'default' in value &&
  Object.keys(value).length === 1
    ? (value as { default: unknown }).default
    : value;

const configRawCache = new Map<
  string,
  { mtimeMs: number; rawConfig: Record<string, unknown> }
>();
const require = createRequire(import.meta.url);

const importConfigModule = async (
  absolutePath: string,
  forceFreshLoad: boolean,
): Promise<unknown> => {
  const extension = extname(absolutePath).toLowerCase();
  const fileUrl = pathToFileURL(absolutePath).href;

  // Fast path for one-shot CLI runs: avoid cache-busting on first load for JS configs.
  if (!forceFreshLoad) {
    if (extension === '.cjs') {
      return require(absolutePath);
    }

    if (extension === '.mjs') {
      return import(fileUrl);
    }

    if (extension === '.js') {
      return import(fileUrl).catch(() => require(absolutePath));
    }
  }

  if (extension === '.cjs' && forceFreshLoad) {
    const resolvedPath = require.resolve(absolutePath);
    delete require.cache[resolvedPath];
    return require(absolutePath);
  }

  // Keep cache-busting for TS (and reload cases) for correctness in long-lived processes/tests.
  const cacheBustUrl = `${fileUrl}?t=${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return import(cacheBustUrl);
};

/**
 * Load raw config from file without validation (for extends resolution)
 */
const loadRawConfigFromFile = Effect.fn('Config.loadRawConfigFromFile')(
  function* (configPath: string) {
    const absolutePath = resolve(configPath);
    const hasLoadedBefore = configRawCache.has(absolutePath);

    if (!existsSync(absolutePath)) {
      return yield* ConfigNotFoundError.pathNotFound(absolutePath);
    }

    const mtimeMs = yield* Effect.try({
      try: () => statSync(absolutePath).mtimeMs,
      catch: (error) => ConfigLoadError.importFailed(absolutePath, error),
    });

    const cached = configRawCache.get(absolutePath);
    if (cached && cached.mtimeMs === mtimeMs) {
      yield* Effect.annotateCurrentSpan('configCacheHit', 'true');
      return cached.rawConfig;
    }

    yield* Effect.annotateCurrentSpan('configCacheHit', 'false');
    yield* Effect.logDebug('Loading config file').pipe(
      Effect.annotateLogs({ path: absolutePath }),
    );

    const loadedModule = yield* Effect.tryPromise({
      try: async () => importConfigModule(absolutePath, hasLoadedBefore),
      catch: (error) => ConfigLoadError.importFailed(absolutePath, error),
    });

    const rawConfig = unwrapTsxDoubleDefault(
      (loadedModule as Record<string, unknown>).default ??
        (loadedModule as Record<string, unknown>).config,
    );

    if (!rawConfig) {
      return yield* ConfigLoadError.noExport(absolutePath);
    }

    const normalizedRawConfig = rawConfig as Record<string, unknown>;
    configRawCache.set(absolutePath, {
      mtimeMs,
      rawConfig: normalizedRawConfig,
    });

    return normalizedRawConfig;
  },
);

/**
 * Recursively resolve config extends chain and merge configs
 */
const resolveConfigExtends: (
  rawConfig: Record<string, unknown>,
  configPath: string,
  visited?: Set<string>,
) => Effect.Effect<Record<string, unknown>, ConfigError> = Effect.fn(
  'Config.resolveConfigExtends',
)(function* (
  rawConfig: Record<string, unknown>,
  configPath: string,
  visited: Set<string> = new Set(),
) {
  const absolutePath = resolve(configPath);

  // Detect circular extends
  if (visited.has(absolutePath)) {
    return yield* ConfigLoadError.circularExtends(absolutePath);
  }
  visited.add(absolutePath);

  const extendsPath = rawConfig.extends as string | undefined;

  if (!extendsPath) {
    return rawConfig;
  }

  // Resolve extends path relative to current config file
  const parentConfigPath = resolve(dirname(absolutePath), extendsPath);

  yield* Effect.logDebug('Resolving config extends').pipe(
    Effect.annotateLogs({ parent: parentConfigPath }),
  );

  // Load parent config
  const parentRawConfig = yield* loadRawConfigFromFile(parentConfigPath);

  // Recursively resolve parent's extends
  const resolvedParent = yield* resolveConfigExtends(
    parentRawConfig,
    parentConfigPath,
    visited,
  );

  // Remove extends from child before merging (it's not a real config property)
  const { extends: _, ...childWithoutExtends } = rawConfig;

  // Deep merge parent with child (child wins)
  return deepMerge(
    resolvedParent as Record<string, unknown>,
    childWithoutExtends,
  );
});

export const loadConfigFromFile = Effect.fn('Config.loadConfigFromFile')(
  function* (configPath: string) {
    // Load raw config
    const rawConfig = yield* loadRawConfigFromFile(configPath);

    // Resolve extends chain
    const mergedConfig = yield* resolveConfigExtends(rawConfig, configPath);

    // Validate merged config (pathFilter is now schema-validated)
    return yield* validateConfig(mergedConfig, configPath);
  },
);

export const loadConfig = Effect.fn('Config.loadConfig')(function* (
  configPath?: string,
  cwd: string = process.cwd(),
) {
  const resolvedPath = configPath
    ? Effect.succeed(configPath)
    : findConfigFile(cwd);
  const path = yield* resolvedPath;
  return yield* loadConfigFromFile(path);
});

export const resolveConfig = (
  config: typeof OpenApiGeneratorConfig.Type,
  configPath: string = 'unknown',
): Effect.Effect<typeof ResolvedConfig.Type, ConfigValidationError> => {
  const files = config.files ?? {};
  const options = config.options ?? {};
  const openapi = config.openapi;
  const security = openapi.security ?? {};

  // Normalize entry to array
  const rawEntry = files.entry ?? DEFAULT_ENTRY;
  const entry = Array.isArray(rawEntry) ? rawEntry : [rawEntry];

  // Normalize dtoGlob to array, using defaults if not specified
  const rawDtoGlob = files.dtoGlob;
  const dtoGlob = rawDtoGlob
    ? Array.isArray(rawDtoGlob)
      ? rawDtoGlob
      : [rawDtoGlob]
    : [...DEFAULT_DTO_GLOB];

  // tsconfig is required - fail with typed config validation error
  const tsconfig = files.tsconfig;
  if (!tsconfig) {
    return Effect.fail(
      ConfigValidationError.fromIssues(configPath, [
        'tsconfig is required in files configuration',
      ]),
    );
  }

  return Effect.succeed({
    tsconfig,
    entry,
    include: files.include ?? DEFAULT_CONFIG.files.include,
    exclude: files.exclude ?? DEFAULT_CONFIG.files.exclude,
    excludeDecorators:
      options.excludeDecorators ?? DEFAULT_CONFIG.options.excludeDecorators,
    dtoGlob,
    extractValidation:
      options.extractValidation ?? DEFAULT_CONFIG.options.extractValidation,
    aliasRefs:
      options.schemas?.aliasRefs ?? DEFAULT_CONFIG.options.schemas.aliasRefs,
    basePath: options.basePath,
    version: openapi.version,
    info: openapi.info,
    servers: openapi.servers ?? DEFAULT_CONFIG.openapi.servers,
    securitySchemes:
      security.schemes ?? DEFAULT_CONFIG.openapi.security.schemes,
    securityRequirements:
      security.global ?? DEFAULT_CONFIG.openapi.security.global,
    tags: openapi.tags ?? DEFAULT_CONFIG.openapi.tags,
    output: config.output,
    format: config.format ?? DEFAULT_CONFIG.format,
  });
};

export const loadAndResolveConfig = Effect.fn('Config.loadAndResolveConfig')(
  function* (configPath?: string, cwd: string = process.cwd()) {
    const config = yield* loadConfig(configPath, cwd);
    return yield* resolveConfig(config, configPath ?? 'unknown');
  },
);

const serviceFindConfigFile = Effect.fn('ConfigService.findConfigFile')(
  function* (startDir: string = process.cwd()) {
    return yield* findConfigFile(startDir);
  },
);

const serviceLoadConfigFromFile = Effect.fn('ConfigService.loadConfigFromFile')(
  function* (configPath: string) {
    return yield* loadConfigFromFile(configPath);
  },
);

const serviceLoadConfig = Effect.fn('ConfigService.loadConfig')(function* (
  configPath?: string,
  cwd: string = process.cwd(),
) {
  return yield* loadConfig(configPath, cwd);
});

const serviceResolveConfig = Effect.fn('ConfigService.resolveConfig')(
  function* (
    config: typeof OpenApiGeneratorConfig.Type,
    configPath: string = 'unknown',
  ) {
    return yield* resolveConfig(config, configPath);
  },
);

const serviceLoadAndResolveConfig = Effect.fn(
  'ConfigService.loadAndResolveConfig',
)(function* (configPath?: string, cwd: string = process.cwd()) {
  return yield* loadAndResolveConfig(configPath, cwd);
});

/**
 * Business service facade for config orchestration.
 */
export class ConfigService extends Effect.Service<ConfigService>()(
  'ConfigService',
  {
    accessors: true,
    effect: Effect.succeed({
      findConfigFile: serviceFindConfigFile,
      loadConfigFromFile: serviceLoadConfigFromFile,
      loadConfig: serviceLoadConfig,
      resolveConfig: serviceResolveConfig,
      loadAndResolveConfig: serviceLoadAndResolveConfig,
    }),
  },
) {}
