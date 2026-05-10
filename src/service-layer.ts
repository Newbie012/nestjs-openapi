import { Layer } from 'effect';
import { ConfigService } from './config.js';
import { MethodExtractionService } from './methods.js';
import { ModuleTraversalService } from './modules.js';
import { OutputService } from './output-service.js';
import { ProjectService } from './project.js';
import { SchemaService } from './schema-service.js';
import { TransformerService } from './transformer.js';
import { ValidationMapperService } from './validation-mapper.js';

/**
 * Shared service dependency graph for generation pipelines.
 */
export const generatorServicesLayer = Layer.mergeAll(
  ConfigService.Default,
  ProjectService.Default,
  ModuleTraversalService.Default,
  MethodExtractionService.Default,
  SchemaService.Default,
  TransformerService.Default,
  ValidationMapperService.Default,
  OutputService.Default,
);
