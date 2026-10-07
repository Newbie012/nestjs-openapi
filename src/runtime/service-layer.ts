import { Layer } from 'effect';
import { ConfigService } from '../config/config.js';
import { MethodExtractionService } from '../analysis/methods.js';
import { ModuleTraversalService } from '../analysis/modules.js';
import { OutputService } from '../document/output-service.js';
import { ProjectService } from '../analysis/project.js';
import { SchemaService } from '../schema/schema-service.js';
import { TransformerService } from '../document/transformer.js';
import { ValidationMapperService } from '../analysis/validation-mapper.js';

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
