/**
 * nestjs-openapi
 *
 * Static code analysis tool to generate OpenAPI specifications from NestJS applications.
 *
 * @example
 * ```typescript
 * // openapi.config.ts
 * import { defineConfig } from 'nestjs-openapi';
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
 * import { generate } from 'nestjs-openapi';
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
  TelemetryConfig,
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
  loadSpecFileEffect,
  generateSwaggerUiHtml,
  resolveOptions,
} from './module.js';
export type {
  OpenApiModuleOptions,
  ResolvedOpenApiModuleOptions,
  SwaggerOptions,
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
  generatePathsEffect,
  generatePathsAsync,
  generateFromConfigEffect,
  generateFromConfigAsync,
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
  DtoGlobResolutionError,
  InvalidMethodError,
  MissingGenericSchemaTempFileCleanupError,
  MissingGenericSchemaTempFileWriteError,
  PublicApiError,
  SpecFileNotFoundError,
  SpecFileReadError,
  SpecFileParseError,
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
  ModuleTraversalService,
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
export {
  getMethodInfo,
  getMethodInfoEffect,
  getControllerMethodInfos,
  getControllerMethodInfosEffect,
  MethodExtractionService,
} from './methods.js';

// Transformation
export {
  transformMethod,
  transformMethodEffect,
  transformMethods,
  transformMethodsEffect,
} from './transformer.js';

// Schema merging
export {
  mergeSchemas,
  mergeSchemasEffect,
  mergeGeneratedSchemas,
  mergeGeneratedSchemasEffect,
  filterSchemas,
  filterSchemasEffect,
  type MergedResult,
} from './schema-merger.js';

// Schema normalization
export {
  normalizeSchemas,
  normalizeSchemasEffect,
  filterInternalSchemas,
  filterInternalSchemasEffect,
  normalizeStructureRefs,
  normalizeStructureRefsEffect,
  toPascalCase,
  type NormalizerOptions,
} from './schema-normalizer.js';

// Schema generation
export {
  generateSchemas,
  generateSchemasFromFiles,
  SchemaGenerationError,
  type SchemaError,
  type SchemaGeneratorOptions,
  type GeneratedSchemas,
  type JsonSchema,
} from './schema-generator.js';

export { SchemaService } from './schema-service.js';

// Validation mapping
export {
  extractPropertyConstraints,
  isPropertyOptional,
  extractPropertyValidationInfo,
  extractClassValidationInfo,
  extractClassValidationInfoEffect,
  extractClassConstraints,
  getRequiredProperties,
  applyConstraintsToSchema,
  mergeValidationConstraints,
  mergeValidationConstraintsEffect,
  type ValidationConstraints,
  type PropertyValidationInfo,
  type ClassValidationInfo,
} from './validation-mapper.js';

export { ValidationService } from './validation-service.js';
export { OutputService } from './output-service.js';

// Config utilities
export {
  ConfigService,
  findConfigFile,
  loadConfigFromFile,
  loadConfig,
  resolveConfig,
  loadAndResolveConfig,
} from './config.js';

// Service layers
export { generatorServicesLayer } from './service-layer.js';

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
