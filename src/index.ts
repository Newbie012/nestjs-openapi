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
export { generate } from './document/generate.js';
export type { GenerateResult } from './document/generate.js';

/**
 * Define configuration with TypeScript type inference
 */
export { defineConfig } from './config/config.js';

/**
 * Reference a class or enum by name in a custom decorator mapping
 */
export { typeRef, TypeRef } from './analysis/decorators.js';

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
  CustomDecoratorMapping,
  CustomDecoratorUse,
  DecoratorSpec,
  SchemaNameCollision,
  SchemaNameCollisionStrategy,
  PathTransform,
} from './config/types.js';

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
} from './runtime/module.js';
export type {
  LoadSpecFileOptions,
  OpenApiDocumentFileSource,
  OpenApiDocumentSource,
  OpenApiHttpApplication,
  OpenApiModuleOptions,
  OpenApiSetupOptions,
  ResolvedOpenApiModuleOptions,
  SwaggerOptions,
} from './runtime/module.js';

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
} from './model/domain.js';

// Errors
export {
  ProjectInitError,
  EntryNotFoundError,
  ConfigNotFoundError,
  ConfigLoadError,
  ConfigValidationError,
  SchemaNameCollisionError,
  DtoGlobResolutionError,
  InvalidMethodError,
  PublicApiError,
  SpecFileNotFoundError,
  SpecFileReadError,
  SpecFileParseError,
  type ProjectError,
  type ConfigError,
  type AnalysisError,
  type GeneratorError,
} from './config/errors.js';

// Services
export {
  ProjectService,
  ProjectServiceLive,
  makeProjectContext,
  type ProjectContext,
  type ProjectOptions,
} from './analysis/project.js';

// Module Exploration
export {
  getModules,
  getAllControllers,
  ModuleTraversalService,
  type ModuleWithControllers,
} from './analysis/modules.js';

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
} from './analysis/controllers.js';

// Method Analysis
export {
  getMethodInfo,
  getMethodInfoEffect,
  getControllerMethodInfos,
  getControllerMethodInfosEffect,
  MethodExtractionService,
} from './analysis/methods.js';

// Transformation
export {
  TransformerService,
  transformMethod,
  transformMethodEffect,
  transformMethods,
  transformMethodsEffect,
} from './document/transformer.js';

// Schema merging
export {
  mergeSchemas,
  mergeSchemasEffect,
  mergeGeneratedSchemas,
  mergeGeneratedSchemasEffect,
  filterSchemas,
  filterSchemasEffect,
  type MergedResult,
} from './schema/schema-merger.js';

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
} from './schema/schema-normalizer.js';

// Schema generation
export {
  generateSchemas,
  generateSchemasFromFiles,
  SchemaGenerationError,
  type SchemaError,
  type SchemaGeneratorOptions,
  type GeneratedSchemas,
  type JsonSchema,
} from './schema/schema-generator.js';

export { SchemaService } from './schema/schema-service.js';

// Validation mapping
export {
  ValidationMapperService,
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
} from './analysis/validation-mapper.js';

export { ValidationService } from './analysis/validation-service.js';
export { OutputService } from './document/output-service.js';

// Config utilities
export {
  ConfigService,
  findConfigFile,
  loadConfigFromFile,
  loadConfig,
  resolveConfig,
  loadAndResolveConfig,
} from './config/config.js';

// Service layers
export { generatorServicesLayer } from './runtime/service-layer.js';

// AST Utilities
export {
  resolveClassFromSymbol,
  getArrayInitializer,
  getStringLiteralValue,
  getSymbolFromIdentifier,
} from './analysis/ast.js';

export {
  isModuleClass,
  getModuleDecoratorArg,
  resolveClassFromExpression,
  resolveArrayOfClasses,
  getModuleMetadata,
  type ModuleMetadata,
} from './analysis/nest-ast.js';

// Spec Validation
export {
  validateSpec,
  categorizeBrokenRefs,
  formatValidationResult,
  type ValidationResult,
  type BrokenRef,
  type BrokenRefCategories,
} from './document/spec-validator.js';
