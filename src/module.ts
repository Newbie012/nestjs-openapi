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
 *       specFile: 'openapi.json',
 *       swagger: true,
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

/**
 * Configuration options for the OpenAPI module
 */
export interface OpenApiModuleOptions {
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
    enabled: options.enabled ?? true,
    jsonPath: options.jsonPath ?? '/openapi.json',
    swagger: {
      enabled: swaggerEnabled,
      path: swaggerPath,
      title: swaggerTitle,
    },
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
    const spec = loadSpecFile(resolvedOptions.specFile);

    // Set swagger title from spec if not provided
    const finalOptions: ResolvedOpenApiModuleOptions = {
      ...resolvedOptions,
      swagger: {
        ...resolvedOptions.swagger,
        title: resolvedOptions.swagger.title || spec.info.title,
      },
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
