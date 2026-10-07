import { Effect } from 'effect';
import {
  generateSchemas,
  generateSchemasFromFiles,
  type GeneratedSchemas,
  type SchemaGeneratorOptions,
} from './schema-generator.js';

const serviceGenerateSchemas = Effect.fn('SchemaService.generateSchemas')(
  function* (options: SchemaGeneratorOptions) {
    return yield* generateSchemas(options);
  },
);

const serviceGenerateSchemasFromFiles = Effect.fn(
  'SchemaService.generateSchemasFromFiles',
)(function* (filePaths: readonly string[], tsconfig: string) {
  return yield* generateSchemasFromFiles(filePaths, tsconfig);
});

export class SchemaService extends Effect.Service<SchemaService>()(
  'SchemaService',
  {
    accessors: true,
    effect: Effect.succeed({
      generateSchemas: serviceGenerateSchemas,
      generateSchemasFromFiles: serviceGenerateSchemasFromFiles,
    }),
  },
) {}

export type { GeneratedSchemas };
