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
  OperationContext,
  OperationExtensions,
  OperationExtensionsHook,
  OverlayDocument,
  OverlayAction,
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

/**
 * Internal generate function (Effect-based)
 * Use this if you want to integrate with Effect-TS
 */
export {
  generate as generateEffect,
  generateAsync,
  generatePathsEffect,
  generatePathsAsync,
  type GenerateOptions,
} from './internal.js';

export type {
  ParameterLocation,
  ResolvedParameter,
  ReturnTypeInfo,
  HttpMethod,
  MethodInfo,
  OpenApiGeneratorConfig,
  ResolvedConfig,
} from './model/domain.js';

export {
  ProjectInitError,
  EntryNotFoundError,
  ConfigNotFoundError,
  ConfigLoadError,
  ConfigValidationError,
  SchemaNameCollisionError,
  OperationExtensionsError,
  OverlayError,
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

export {
  makeProjectContext,
  type ProjectContext,
  type ProjectOptions,
} from './analysis/project.js';

export {
  getModules,
  getAllControllers,
  type ModuleWithControllers,
} from './analysis/modules.js';

export {
  getControllerPrefix,
  getControllerName,
  isHttpMethod,
  getDecoratorName,
  getControllerTags,
  getHttpDecorator,
  normalizePath,
} from './analysis/controllers.js';

export { getMethodInfo, getControllerMethodInfos } from './analysis/methods.js';

export { transformMethod, transformMethods } from './document/transformer.js';

export { mergeSchemas, type MergedResult } from './schema/schema-merger.js';

export {
  normalizeStructureRefs,
  toPascalCase,
} from './schema/schema-normalizer.js';

export {
  generateSchemas,
  generateSchemasFromFiles,
  SchemaGenerationError,
  type SchemaError,
  type SchemaGeneratorOptions,
  type GeneratedSchemas,
  type JsonSchema,
} from './schema/schema-generator.js';

export {
  extractPropertyConstraints,
  isPropertyOptional,
  extractPropertyValidationInfo,
  extractClassValidationInfo,
  extractClassValidationInfoEffect,
  applyConstraintsToSchema,
  mergeValidationConstraints,
  type ValidationConstraints,
  type PropertyValidationInfo,
  type ClassValidationInfo,
} from './analysis/validation-mapper.js';

export { OutputService } from './document/output-service.js';

export {
  ConfigService,
  findConfigFile,
  loadConfigFromFile,
  loadConfig,
  resolveConfig,
  loadAndResolveConfig,
} from './config/config.js';

export { generatorServicesLayer } from './runtime/service-layer.js';

export {
  resolveClassFromSymbol,
  getArrayInitializer,
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

export {
  validateSpec,
  categorizeBrokenRefs,
  formatValidationResult,
  validateStructure,
  type StructuralError,
  type ValidationResult,
  type BrokenRef,
  type BrokenRefCategories,
} from './document/spec-validator.js';
