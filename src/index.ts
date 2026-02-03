/**
 * nestjs-openapi-static
 *
 * Static code analysis tool to generate OpenAPI specifications from NestJS applications.
 *
 * @example
 * ```typescript
 * // openapi.config.ts
 * import { defineConfig } from 'nestjs-openapi-static';
 *
 * export default defineConfig({
 *   output: 'src/openapi/openapi.generated.json',
 *   files: {
 *     entry: 'src/app.module.ts',
 *     dtoGlob: 'src/**\/*.dto.ts',
 *   },
 *   openapi: {
 *     info: {
 *       title: 'My API',
 *       version: '1.0.0',
 *     },
 *   },
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Programmatic usage
 * import { generate } from 'nestjs-openapi-static';
 *
 * await generate('apps/my-app/openapi.config.ts');
 * ```
 */

// =============================================================================
// Primary Public API
// =============================================================================

/**
 * Generate OpenAPI specification from a NestJS application
 */
export { generate } from './generate.js';
export type { GenerateResult } from './generate.js';

/**
 * Define configuration with TypeScript type inference
 */
export { defineConfig } from './config.js';

/**
 * Public types for configuration
 */
export type {
  Config,
  InfoConfig,
  ContactConfig,
  LicenseConfig,
  ServerConfig,
  TagConfig,
  OutputFormat,
  GenerateOverrides,
  OpenApiSpec,
  OpenApiPaths,
  OpenApiOperation,
  OpenApiParameter,
  OpenApiRequestBody,
  OpenApiResponse,
  OpenApiSchema,
} from './types.js';

/**
 * NestJS module for serving OpenAPI specifications at runtime
 */
export {
  OpenApiModule,
  OPENAPI_MODULE_OPTIONS,
  OPENAPI_SPEC,
  loadSpecFile,
  generateSwaggerUiHtml,
  resolveOptions,
} from './module.js';
export type {
  OpenApiModuleOptions,
  ResolvedOpenApiModuleOptions,
} from './module.js';

// =============================================================================
// Advanced API (for users who need more control)
// =============================================================================

/**
 * Internal generate function (Effect-based)
 * Use this if you want to integrate with Effect-TS
 */
export {
  generate as generateEffect,
  generateAsync,
  type GenerateOptions,
} from './internal.js';

// Domain Types
export type {
  ParameterLocation,
  ResolvedParameter,
  ReturnTypeInfo,
  HttpMethod,
  MethodInfo,
  OpenApiGeneratorConfig,
  ResolvedConfig,
} from './domain.js';

// Errors
export {
  ProjectInitError,
  EntryNotFoundError,
  ConfigNotFoundError,
  ConfigLoadError,
  ConfigValidationError,
  InvalidMethodError,
  type ProjectError,
  type ConfigError,
  type AnalysisError,
  type GeneratorError,
} from './errors.js';

// Services
export {
  ProjectService,
  ProjectServiceLive,
  makeProjectContext,
  type ProjectContext,
  type ProjectOptions,
} from './project.js';

// Module Exploration
export {
  getModules,
  getAllControllers,
  type ModuleWithControllers,
} from './modules.js';

// Controller Analysis
export {
  getControllerPrefix,
  getControllerName,
  isHttpMethod,
  getHttpMethods,
  getDecoratorName,
  getControllerTags,
  getHttpDecorator,
  isHttpDecorator,
  normalizePath,
} from './controllers.js';

// Method Analysis
export { getMethodInfo, getControllerMethodInfos } from './methods.js';

// Transformation
export { transformMethod, transformMethods } from './transformer.js';

// Config utilities
export {
  findConfigFile,
  loadConfigFromFile,
  loadConfig,
  resolveConfig,
  loadAndResolveConfig,
} from './config.js';

// AST Utilities
export {
  resolveClassFromSymbol,
  getArrayInitializer,
  getStringLiteralValue,
  getSymbolFromIdentifier,
} from './ast.js';

export {
  isModuleClass,
  getModuleDecoratorArg,
  resolveClassFromExpression,
  resolveArrayOfClasses,
  getModuleMetadata,
  type ModuleMetadata,
} from './nest-ast.js';

// Spec Validation
export {
  validateSpec,
  categorizeBrokenRefs,
  formatValidationResult,
  type ValidationResult,
  type BrokenRef,
  type BrokenRefCategories,
} from './spec-validator.js';
