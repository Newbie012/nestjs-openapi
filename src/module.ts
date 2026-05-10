/**
 * NestJS Module for serving generated OpenAPI specifications at runtime.
 *
 * @example
 * ```typescript
 * import { OpenApiModule } from 'nestjs-openapi';
 *
 * @Module({
 *   imports: [
 *     OpenApiModule.forRoot({
 *       specFile: 'openapi.json',
 *       swagger: true,
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */

import { readFileSync } from 'node:fs';
import { fail as assertFail } from 'node:assert';
import { resolve } from 'node:path';
import {
  Module,
  type DynamicModule,
  type Provider,
  type Type,
} from '@nestjs/common';
import { Cause, Effect, Either, Exit, Option } from 'effect';
import {
  SpecFileNotFoundError,
  SpecFileParseError,
  SpecFileReadError,
} from './errors.js';
import type { OpenApiSpec } from './types.js';

// NestJS metadata constants (from @nestjs/common/constants)
const PATH_METADATA = 'path';
const METHOD_METADATA = 'method';
const HEADERS_METADATA = '__headers__';
const CONTROLLER_WATERMARK = '__controller__';

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Swagger UI configuration options
 */
export interface SwaggerOptions {
  /**
   * The path where Swagger UI will be served.
   * @default "/api-docs"
   */
  readonly path?: string;

  /**
   * Custom title for the Swagger UI page.
   * Uses the spec's info.title if not provided.
   */
  readonly title?: string;
}

export interface LoadSpecFileOptions {
  /**
   * Additional spec files to try when the primary file is missing.
   */
  readonly fallbackSpecFiles?: readonly string[];
}

export interface OpenApiDocumentFileSource extends LoadSpecFileOptions {
  /**
   * Path to the generated OpenAPI JSON file.
   * Can be absolute or relative to the current working directory.
   */
  readonly specFile: string;
}

export type OpenApiDocumentSource =
  | OpenApiSpec
  | (() => OpenApiSpec)
  | OpenApiDocumentFileSource;

/**
 * Configuration options for the OpenAPI module
 */
export interface OpenApiModuleOptions extends LoadSpecFileOptions {
  /**
   * Path to the generated OpenAPI JSON file.
   * Can be absolute or relative to the current working directory.
   */
  readonly specFile: string;

  /**
   * Whether the module is enabled.
   * When false, no routes are registered.
   * @default true
   */
  readonly enabled?: boolean;

  /**
   * The path where the OpenAPI JSON will be served.
   * @default "/openapi.json"
   */
  readonly jsonPath?: string;

  /**
   * Swagger UI configuration.
   * - `true` - Enable with defaults (path: '/api-docs', title from spec)
   * - `false` or omitted - Disable Swagger UI
   * - `object` - Enable with custom configuration
   * @default false
   */
  readonly swagger?: boolean | SwaggerOptions;
}

/**
 * Resolved options with all defaults applied
 */
export interface ResolvedOpenApiModuleOptions {
  readonly specFile: string;
  readonly fallbackSpecFiles: readonly string[];
  readonly enabled: boolean;
  readonly jsonPath: string;
  readonly swagger: {
    readonly enabled: boolean;
    readonly path: string;
    readonly title: string;
  };
}

/**
 * Injection token for OpenAPI module options
 */
export const OPENAPI_MODULE_OPTIONS = Symbol('OPENAPI_MODULE_OPTIONS');

/**
 * Injection token for the loaded OpenAPI specification
 */
export const OPENAPI_SPEC = Symbol('OPENAPI_SPEC');

interface OpenApiModuleState {
  readonly options: ResolvedOpenApiModuleOptions;
  readonly spec?: OpenApiSpec;
}

interface OpenApiRouteRegistrar {
  readonly get: (
    path: string,
    handler: (request: unknown, response: unknown) => void,
  ) => void;
}

export interface OpenApiHttpApplication {
  readonly config?: {
    readonly getGlobalPrefix?: () => string;
  };
  readonly getHttpAdapter: () => OpenApiRouteRegistrar;
}

export interface OpenApiSetupOptions {
  /**
   * Whether OpenAPI routes should be registered.
   * @default true
   */
  readonly enabled?: boolean;

  /**
   * Prefix OpenAPI routes with the app's `setGlobalPrefix()` value.
   * Matches @nestjs/swagger's `SwaggerCustomOptions.useGlobalPrefix`.
   * @default false
   */
  readonly useGlobalPrefix?: boolean;

  /**
   * Raw OpenAPI JSON endpoint path.
   * Matches @nestjs/swagger's `SwaggerCustomOptions.jsonDocumentUrl`.
   * @default `${docsPath}-json`
   */
  readonly jsonDocumentUrl?: string;

  /**
   * Whether Swagger UI should be served.
   * Matches @nestjs/swagger's `SwaggerCustomOptions.ui`.
   * @default true
   */
  readonly ui?: boolean;

  /**
   * Whether raw OpenAPI definitions should be served.
   * Only JSON is supported.
   * @default true
   */
  readonly raw?: boolean | readonly 'json'[];

  /**
   * Browser title for Swagger UI.
   * Matches @nestjs/swagger's `SwaggerCustomOptions.customSiteTitle`.
   * Uses the spec's info.title if not provided.
   */
  readonly customSiteTitle?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generate Swagger UI HTML page
 */
export function generateSwaggerUiHtml(title: string, jsonPath: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <style>
    html { box-sizing: border-box; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin: 0; background: #fafafa; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        url: "${escapeHtml(jsonPath)}",
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout"
      });
    };
  </script>
</body>
</html>`;
}

function isErrorWithCode(cause: unknown, code: string): boolean {
  return (
    cause !== null &&
    typeof cause === 'object' &&
    'code' in cause &&
    cause.code === code
  );
}

function getSpecFileCandidates(
  filePath: string,
  options: LoadSpecFileOptions = {},
): readonly string[] {
  const candidates = [filePath];

  candidates.push(...(options.fallbackSpecFiles ?? []));

  return [...new Set(candidates)];
}

const readSpecFileContentEffect = (filePath: string) =>
  Effect.try({
    try: () => readFileSync(resolve(process.cwd(), filePath), 'utf-8'),
    catch: (cause) =>
      isErrorWithCode(cause, 'ENOENT')
        ? SpecFileNotFoundError.create(filePath)
        : SpecFileReadError.create(filePath, cause),
  });

/**
 * Load the OpenAPI spec file from disk
 */
export const loadSpecFileEffect = Effect.fn('OpenApiModule.loadSpecFile')(
  function* (filePath: string, options: LoadSpecFileOptions = {}) {
    for (const candidate of getSpecFileCandidates(filePath, options)) {
      const contentResult = yield* readSpecFileContentEffect(candidate).pipe(
        Effect.either,
      );

      if (Either.isLeft(contentResult)) {
        if (contentResult.left instanceof SpecFileNotFoundError) {
          continue;
        }

        return yield* Effect.fail(contentResult.left);
      }

      return yield* Effect.try({
        try: () => JSON.parse(contentResult.right) as OpenApiSpec,
        catch: (cause) => SpecFileParseError.create(candidate, cause),
      });
    }

    return yield* Effect.fail(SpecFileNotFoundError.create(filePath));
  },
);

export function loadSpecFile(
  filePath: string,
  options: LoadSpecFileOptions = {},
): OpenApiSpec {
  const exit = Effect.runSyncExit(loadSpecFileEffect(filePath, options));
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }

  const failure = Cause.failureOption(exit.cause);
  if (Option.isSome(failure)) {
    assertFail(failure.value);
  }

  assertFail(Cause.pretty(exit.cause));
}

/**
 * Resolve options with defaults
 */
export function resolveOptions(
  options: OpenApiModuleOptions,
): ResolvedOpenApiModuleOptions {
  // Resolve swagger options
  let swaggerEnabled = false;
  let swaggerPath = '/api-docs';
  let swaggerTitle = '';

  if (options.swagger === true) {
    swaggerEnabled = true;
  } else if (options.swagger && typeof options.swagger === 'object') {
    swaggerEnabled = true;
    swaggerPath = options.swagger.path ?? '/api-docs';
    swaggerTitle = options.swagger.title ?? '';
  }

  return {
    specFile: options.specFile,
    fallbackSpecFiles: options.fallbackSpecFiles ?? [],
    enabled: options.enabled ?? true,
    jsonPath: options.jsonPath ?? '/openapi.json',
    swagger: {
      enabled: swaggerEnabled,
      path: swaggerPath,
      title: swaggerTitle,
    },
  };
}

function resolveOptionsWithSpecTitle(
  options: ResolvedOpenApiModuleOptions,
  spec: OpenApiSpec,
): ResolvedOpenApiModuleOptions {
  return {
    ...options,
    swagger: {
      ...options.swagger,
      title: options.swagger.title || spec.info.title,
    },
  };
}

function createOpenApiModuleState(
  options: OpenApiModuleOptions,
): OpenApiModuleState {
  const resolvedOptions = resolveOptions(options);

  if (!resolvedOptions.enabled) {
    return { options: resolvedOptions };
  }

  const spec = loadSpecFile(resolvedOptions.specFile, resolvedOptions);

  return {
    spec,
    options: resolveOptionsWithSpecTitle(resolvedOptions, spec),
  };
}

// =============================================================================
// Module
// =============================================================================

/**
 * NestJS module for serving generated OpenAPI specifications at runtime.
 *
 * This module provides:
 * - JSON endpoint for the OpenAPI specification
 * - Optional Swagger UI for interactive documentation
 * - Conditional enabling based on environment
 *
 * @example
 * ```typescript
 * // Basic usage - serve JSON only
 * OpenApiModule.forRoot({
 *   specFile: 'openapi.json',
 * })
 *
 * // With Swagger UI (defaults)
 * OpenApiModule.forRoot({
 *   specFile: 'openapi.json',
 *   swagger: true,
 * })
 *
 * // With Swagger UI (custom options)
 * OpenApiModule.forRoot({
 *   specFile: 'openapi.json',
 *   swagger: { path: '/docs', title: 'My API' },
 * })
 *
 * // Conditionally enabled
 * OpenApiModule.forRoot({
 *   specFile: 'openapi.json',
 *   enabled: process.env.OPENAPI_ENABLED === 'true',
 * })
 * ```
 */
@Module({})
export class OpenApiModule {
  /**
   * Configure the OpenAPI module with options.
   *
   * @param options - Configuration options
   * @returns Dynamic module configuration
   */
  static forRoot(options: OpenApiModuleOptions): DynamicModule {
    const state = createOpenApiModuleState(options);

    // If disabled, return empty module
    if (!state.options.enabled || !state.spec) {
      return {
        module: OpenApiModule,
        providers: [],
        controllers: [],
        exports: [],
      };
    }

    const providers: Provider[] = [
      {
        provide: OPENAPI_MODULE_OPTIONS,
        useValue: state.options,
      },
      {
        provide: OPENAPI_SPEC,
        useValue: state.spec,
      },
    ];

    // Create controllers dynamically using metadata
    const controllers = createOpenApiControllers(state.options, state.spec);

    return {
      module: OpenApiModule,
      providers,
      controllers,
      exports: [OPENAPI_MODULE_OPTIONS, OPENAPI_SPEC],
    };
  }

  /**
   * Register OpenAPI JSON and Swagger UI routes on an already-created Nest app.
   *
   * Use this when the route config depends on services that are only available
   * during bootstrap. For module-level static config, prefer `forRoot()`.
   */
  static setup(
    path: string,
    app: OpenApiHttpApplication,
    documentSource: OpenApiDocumentSource,
    options: OpenApiSetupOptions = {},
  ): void {
    if (options.enabled === false) {
      return;
    }

    const spec = loadDocumentSource(documentSource);
    const httpAdapter = app.getHttpAdapter();
    const swaggerPath = resolveSetupPath(path, app, options);
    const jsonPath = resolveJsonDocumentUrl(swaggerPath, app, options);

    if (shouldServeJson(options.raw)) {
      httpAdapter.get(jsonPath, (_request, response) => {
        sendResponse(response, spec, 'application/json');
      });
    }

    if (options.ui !== false) {
      httpAdapter.get(swaggerPath, (_request, response) => {
        sendResponse(
          response,
          generateSwaggerUiHtml(
            options.customSiteTitle ?? spec.info.title,
            jsonPath,
          ),
          'text/html',
        );
      });
    }
  }
}

function loadDocumentSource(source: OpenApiDocumentSource): OpenApiSpec {
  if (typeof source === 'function') {
    return source();
  }

  if (isDocumentFileSource(source)) {
    return loadSpecFile(source.specFile, source);
  }

  return source;
}

function isDocumentFileSource(
  source: OpenApiDocumentSource,
): source is OpenApiDocumentFileSource {
  return (
    source !== null &&
    typeof source === 'object' &&
    'specFile' in source &&
    typeof source.specFile === 'string'
  );
}

function resolveSetupPath(
  path: string,
  app: OpenApiHttpApplication,
  options: OpenApiSetupOptions,
): string {
  return joinRoutePath(
    options.useGlobalPrefix === true ? getGlobalPrefix(app) : undefined,
    path,
  );
}

function resolveJsonDocumentUrl(
  finalSwaggerPath: string,
  app: OpenApiHttpApplication,
  options: OpenApiSetupOptions,
): string {
  if (!options.jsonDocumentUrl) {
    return `${finalSwaggerPath}-json`;
  }

  return joinRoutePath(
    options.useGlobalPrefix === true ? getGlobalPrefix(app) : undefined,
    options.jsonDocumentUrl,
  );
}

function getGlobalPrefix(app: OpenApiHttpApplication): string {
  const appWithConfig = app as {
    readonly config?: { readonly getGlobalPrefix?: () => string };
  };

  return appWithConfig.config?.getGlobalPrefix?.() ?? '';
}

function shouldServeJson(raw: OpenApiSetupOptions['raw']): boolean {
  return (
    raw === undefined || raw === true || (Array.isArray(raw) && raw.length > 0)
  );
}

function joinRoutePath(...parts: readonly (string | undefined)[]): string {
  return `/${parts
    .filter((part): part is string => part !== undefined && part !== '')
    .map((part) => part.replace(/^\/+|\/+$/g, ''))
    .filter((part) => part.length > 0)
    .join('/')}`;
}

function sendResponse(
  response: unknown,
  body: OpenApiSpec | string,
  contentType: string,
): void {
  const responseLike = response as {
    type?: (contentType: string) => { send: (body: unknown) => void };
    setHeader?: (name: string, value: string) => void;
    json?: (body: unknown) => void;
    send?: (body: unknown) => void;
    end?: (body: string) => void;
  };

  responseLike.setHeader?.('Content-Type', contentType);

  if (contentType === 'application/json' && responseLike.json) {
    responseLike.json(body);
    return;
  }

  if (responseLike.type && responseLike.send) {
    responseLike.type(contentType).send(body);
    return;
  }

  if (responseLike.send) {
    responseLike.send(body);
    return;
  }

  responseLike.end?.(typeof body === 'string' ? body : JSON.stringify(body));
}

/**
 * Create a controller class for serving JSON spec
 */
function createJsonController(
  controllerPath: string,
  spec: OpenApiSpec,
): Type<unknown> {
  // Define the class with a method
  class JsonSpecController {
    getSpec(): OpenApiSpec {
      return spec;
    }
  }

  // Mark as a NestJS controller
  Reflect.defineMetadata(CONTROLLER_WATERMARK, true, JsonSpecController);

  // Apply controller decorator metadata
  Reflect.defineMetadata(PATH_METADATA, controllerPath, JsonSpecController);

  // Get the method function
  const method = JsonSpecController.prototype.getSpec;

  // Apply method decorator metadata directly to the function (how NestJS does it)
  Reflect.defineMetadata(METHOD_METADATA, 0, method); // GET = 0
  Reflect.defineMetadata(PATH_METADATA, '/', method);
  Reflect.defineMetadata(
    HEADERS_METADATA,
    [{ name: 'Content-Type', value: 'application/json' }],
    method,
  );

  return JsonSpecController;
}

/**
 * Create a controller class for serving Swagger UI
 */
function createSwaggerUiController(
  controllerPath: string,
  title: string,
  jsonPath: string,
): Type<unknown> {
  // Define the class with a method
  class SwaggerUiController {
    getSwaggerUi(): string {
      return generateSwaggerUiHtml(title, jsonPath);
    }
  }

  // Mark as a NestJS controller
  Reflect.defineMetadata(CONTROLLER_WATERMARK, true, SwaggerUiController);

  // Apply controller decorator metadata
  Reflect.defineMetadata(PATH_METADATA, controllerPath, SwaggerUiController);

  // Get the method function
  const method = SwaggerUiController.prototype.getSwaggerUi;

  // Apply method decorator metadata directly to the function (how NestJS does it)
  Reflect.defineMetadata(METHOD_METADATA, 0, method); // GET = 0
  Reflect.defineMetadata(PATH_METADATA, '/', method);
  Reflect.defineMetadata(
    HEADERS_METADATA,
    [{ name: 'Content-Type', value: 'text/html' }],
    method,
  );

  return SwaggerUiController;
}

/**
 * Create controller classes dynamically with the correct routes
 */
function createOpenApiControllers(
  options: ResolvedOpenApiModuleOptions,
  spec: OpenApiSpec,
): Type<unknown>[] {
  const controllers: Type<unknown>[] = [];

  // Create JSON controller
  const jsonController = createJsonController(options.jsonPath, spec);
  controllers.push(jsonController);

  // Create Swagger UI controller if enabled
  if (options.swagger.enabled) {
    const swaggerUiController = createSwaggerUiController(
      options.swagger.path,
      options.swagger.title,
      options.jsonPath,
    );
    controllers.push(swaggerUiController);
  }

  return controllers;
}
