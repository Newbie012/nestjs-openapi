import { Effect } from 'effect';
import {
  PublicApiError,
  type GeneratorError,
  type ProjectError,
} from './errors.js';

const toPublicApiError = <E>(error: E) =>
  Effect.fail(PublicApiError.fromUnknown(error));

export const mapProjectErrorsToPublicApi = <A>(
  program: Effect.Effect<A, ProjectError, never>,
): Effect.Effect<A, PublicApiError, never> =>
  program.pipe(
    Effect.catchTags({
      ProjectInitError: toPublicApiError,
      EntryNotFoundError: toPublicApiError,
    }),
  );

export const mapGeneratorErrorsToPublicApi = <A>(
  program: Effect.Effect<A, GeneratorError, never>,
): Effect.Effect<A, PublicApiError, never> =>
  program.pipe(
    Effect.catchTags({
      ProjectInitError: toPublicApiError,
      EntryNotFoundError: toPublicApiError,
      ConfigNotFoundError: toPublicApiError,
      ConfigLoadError: toPublicApiError,
      ConfigValidationError: toPublicApiError,
      InvalidMethodError: toPublicApiError,
      MissingGenericSchemaTempFileWriteError: toPublicApiError,
      MissingGenericSchemaTempFileCleanupError: toPublicApiError,
      DtoGlobResolutionError: toPublicApiError,
      SchemaGenerationError: toPublicApiError,
      ValidationMappingError: toPublicApiError,
      SpecFileNotFoundError: toPublicApiError,
      SpecFileReadError: toPublicApiError,
      SpecFileParseError: toPublicApiError,
      OutputDirectoryCreationError: toPublicApiError,
      OutputSerializationError: toPublicApiError,
      OutputWriteError: toPublicApiError,
      PublicApiError: (error) => Effect.fail(error),
    }),
  );

export const runProjectApiPromise = <A>(
  program: Effect.Effect<A, ProjectError, never>,
): Promise<A> => Effect.runPromise(mapProjectErrorsToPublicApi(program));

export const runGeneratorApiPromise = <A>(
  program: Effect.Effect<A, GeneratorError, never>,
): Promise<A> => Effect.runPromise(mapGeneratorErrorsToPublicApi(program));
