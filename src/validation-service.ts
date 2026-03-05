import { Effect } from 'effect';
import type { ClassDeclaration } from 'ts-morph';
import {
  extractClassValidationInfoEffect,
  mergeValidationConstraintsEffect,
  type ValidationConstraints,
} from './validation-mapper.js';
import type { GeneratedSchemas } from './schema-generator.js';

const serviceExtractClassValidationInfo = Effect.fn(
  'ValidationService.extractClassValidationInfo',
)(function* (classDecl: ClassDeclaration) {
  return yield* extractClassValidationInfoEffect(classDecl);
});

const serviceMergeValidationConstraints = Effect.fn(
  'ValidationService.mergeValidationConstraints',
)(function* (
  schemas: GeneratedSchemas,
  classConstraints: Map<string, Record<string, ValidationConstraints>>,
  classRequired: Map<string, readonly string[]>,
) {
  return yield* mergeValidationConstraintsEffect(
    schemas,
    classConstraints,
    classRequired,
  );
});

export class ValidationService extends Effect.Service<ValidationService>()(
  'ValidationService',
  {
    accessors: true,
    effect: Effect.succeed({
      extractClassValidationInfo: serviceExtractClassValidationInfo,
      mergeValidationConstraints: serviceMergeValidationConstraints,
    }),
  },
) {}
