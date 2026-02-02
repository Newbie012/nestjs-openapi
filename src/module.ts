/**
 * NestJS Module for serving generated OpenAPI specifications at runtime.
 *
 * @example
 * ```typescript
 * import { OpenApiModule } from 'nestjs-openapi-static';
 *
 * @Module({
 *   imports: [
 *     OpenApiModule.forRoot({
 *       filePath: 'src/openapi/openapi.generated.json',
 *       enabled: process.env.NODE_ENV !== 'production',
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  Module,
  type DynamicModule,
  type Provider,
  type Type,
} from '@nestjs/common';
import type { OpenApiSpec } from './types.js';

// NestJS metadata constants (from @nestjs/common/constants)
const PATH_METADATA = 'path';
const METHOD_METADATA = 'method';
const HEADERS_METADATA = '__headers__';

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Configuration options for the OpenAPI module
 */
export interface OpenApiModuleOptions {
  /**
   * Path to the generated OpenAPI JSON file.
   * Can be absolute or relative to the current working directory.
   */
  readonly filePath: string;

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
   * Whether to serve Swagger UI.
   * @default false
   */
  readonly serveSwaggerUi?: boolean;

  /**
   * The path where Swagger UI will be served (if enabled).
   * @default "/api-docs"
   */
  readonly swaggerUiPath?: string;

  /**
   * Custom title for the Swagger UI page.
   * Uses the spec's info.title if not provided.
   */
  readonly swaggerUiTitle?: string;
}

/**
 * Resolved options with all defaults applied
 */
export interface ResolvedOpenApiModuleOptions {
  readonly filePath: string;
  readonly enabled: boolean;
  readonly jsonPath: string;
  readonly serveSwaggerUi: boolean;
  readonly swaggerUiPath: string;
  readonly swaggerUiTitle: string;
}

/**
 * Injection token for OpenAPI module options
 */
export const OPENAPI_MODULE_OPTIONS = Symbol('OPENAPI_MODULE_OPTIONS');

/**
 * Injection token for the loaded OpenAPI specification
 */
export const OPENAPI_SPEC = Symbol('OPENAPI_SPEC');

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

/**
 * Load the OpenAPI spec file from disk
 */
export function loadSpecFile(filePath: string): OpenApiSpec {
  try {
    const resolvedPath = resolve(process.cwd(), filePath);
    const content = readFileSync(resolvedPath, 'utf-8');
    return JSON.parse(content) as OpenApiSpec;
  } catch (error) {
    if (error instanceof Error) {
      if ('code' in error && error.code === 'ENOENT') {
        throw new Error(
          `OpenAPI spec file not found: ${filePath}. ` +
            `Make sure to run 'nestjs-openapi-static generate' first.`,
        );
      }
      throw new Error(`Failed to load OpenAPI spec: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Resolve options with defaults
 */
export function resolveOptions(
  options: OpenApiModuleOptions,
): ResolvedOpenApiModuleOptions {
  return {
    filePath: options.filePath,
    enabled: options.enabled ?? true,
    jsonPath: options.jsonPath ?? '/openapi.json',
    serveSwaggerUi: options.serveSwaggerUi ?? false,
    swaggerUiPath: options.swaggerUiPath ?? '/api-docs',
    swaggerUiTitle: options.swaggerUiTitle ?? '',
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
 *   filePath: 'src/openapi/openapi.generated.json',
 * })
 *
 * // With Swagger UI
 * OpenApiModule.forRoot({
 *   filePath: 'src/openapi/openapi.generated.json',
 *   serveSwaggerUi: true,
 *   swaggerUiPath: '/docs',
 * })
 *
 * // Conditionally enabled
 * OpenApiModule.forRoot({
 *   filePath: 'src/openapi/openapi.generated.json',
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
    const resolvedOptions = resolveOptions(options);

    // If disabled, return empty module
    if (!resolvedOptions.enabled) {
      return {
        module: OpenApiModule,
        providers: [],
        controllers: [],
        exports: [],
      };
    }

    // Load the spec file
    const spec = loadSpecFile(resolvedOptions.filePath);

    // Set title from spec if not provided
    const finalOptions: ResolvedOpenApiModuleOptions = {
      ...resolvedOptions,
      swaggerUiTitle: resolvedOptions.swaggerUiTitle || spec.info.title,
    };

    const providers: Provider[] = [
      {
        provide: OPENAPI_MODULE_OPTIONS,
        useValue: finalOptions,
      },
      {
        provide: OPENAPI_SPEC,
        useValue: spec,
      },
    ];

    // Create controllers dynamically using metadata
    const controllers = createOpenApiControllers(finalOptions, spec);

    return {
      module: OpenApiModule,
      providers,
      controllers,
      exports: [OPENAPI_MODULE_OPTIONS, OPENAPI_SPEC],
    };
  }
}

/**
 * Create a controller class with proper NestJS metadata
 */
function createController(
  controllerPath: string,
  methodName: string,
  contentType: string,
  handler: () => unknown,
): Type<unknown> {
  // Create a controller class
  class DynamicController {
    [methodName](): unknown {
      return handler();
    }
  }

  // Set controller path metadata
  Reflect.defineMetadata(PATH_METADATA, controllerPath, DynamicController);

  // Set method metadata (GET = 0 in RequestMethod enum)
  Reflect.defineMetadata(
    METHOD_METADATA,
    0,
    DynamicController.prototype,
    methodName,
  );

  // Set route path metadata (empty string for root of controller)
  Reflect.defineMetadata(
    PATH_METADATA,
    '/',
    DynamicController.prototype,
    methodName,
  );

  // Set headers metadata
  Reflect.defineMetadata(
    HEADERS_METADATA,
    [{ name: 'Content-Type', value: contentType }],
    DynamicController.prototype,
    methodName,
  );

  return DynamicController;
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
  const jsonController = createController(
    options.jsonPath,
    'getSpec',
    'application/json',
    () => spec,
  );
  controllers.push(jsonController);

  // Create Swagger UI controller if enabled
  if (options.serveSwaggerUi) {
    const swaggerUiController = createController(
      options.swaggerUiPath,
      'getSwaggerUi',
      'text/html',
      () => generateSwaggerUiHtml(options.swaggerUiTitle, options.jsonPath),
    );
    controllers.push(swaggerUiController);
  }

  return controllers;
}
