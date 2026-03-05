import { Layer } from 'effect';
import { ConfigService } from './config.js';
import { MethodExtractionService } from './methods.js';
import { ModuleTraversalService } from './modules.js';
import { OutputService } from './output-service.js';
import { ProjectService } from './project.js';
import { SchemaService } from './schema-service.js';
import { ValidationService } from './validation-service.js';

/**
 * Shared service dependency graph for generation pipelines.
 */
export const generatorServicesLayer = Layer.mergeAll(
  ConfigService.Default,
  ProjectService.Default,
  ModuleTraversalService.Default,
  MethodExtractionService.Default,
  SchemaService.Default,
  ValidationService.Default,
  OutputService.Default,
);
