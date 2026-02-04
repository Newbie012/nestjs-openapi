/**
 * Internal Effect-based API
 *
 * This module exposes the Effect-based implementation for users who want
 * to integrate with Effect-TS. For most users, the Promise-based API
 * in the main module is recommended.
 */

import { Effect } from 'effect';
import { Project } from 'ts-morph';
import { EntryNotFoundError, type ProjectError } from './errors.js';
import { getModules } from './modules.js';
import { getControllerMethodInfos } from './methods.js';
import { transformMethods } from './transformer.js';
import type { OpenApiPaths } from './domain.js';

export interface GenerateOptions {
  readonly tsconfig: string;
  readonly entry: string;
}

/**
 * Generate OpenAPI paths using Effect
 *
 * @example
 * ```typescript
 * import { Effect } from 'effect';
 * import { generate } from 'nestjs-openapi/internal';
 *
 * const program = generate({
 *   tsconfig: './tsconfig.json',
 *   entry: './src/app.module.ts'
 * });
 *
 * const paths = await Effect.runPromise(program);
 * ```
 */
export const generate = (
  options: GenerateOptions,
): Effect.Effect<OpenApiPaths, ProjectError> =>
  Effect.gen(function* () {
    yield* Effect.logInfo('Starting OpenAPI generation').pipe(
      Effect.annotateLogs({ entry: options.entry }),
    );

    const project = new Project({
      tsConfigFilePath: options.tsconfig,
      skipAddingFilesFromTsConfig: true,
    });

    project.addSourceFilesAtPaths(options.entry);
    project.resolveSourceFileDependencies();

    const entrySourceFile = project.getSourceFile(options.entry);
    if (!entrySourceFile) {
      return yield* EntryNotFoundError.fileNotFound(options.entry);
    }

    const entryClass = entrySourceFile.getClass('AppModule');
    if (!entryClass) {
      return yield* EntryNotFoundError.classNotFound(
        options.entry,
        'AppModule',
      );
    }

    const modules = yield* getModules(entryClass);

    const methodInfos = modules.flatMap((mod) =>
      mod.controllers.flatMap((controller) =>
        getControllerMethodInfos(controller),
      ),
    );

    yield* Effect.logInfo('Collected method infos').pipe(
      Effect.annotateLogs({
        modules: modules.length,
        methods: methodInfos.length,
      }),
    );

    const paths = transformMethods(methodInfos);

    yield* Effect.logInfo('OpenAPI generation complete').pipe(
      Effect.annotateLogs({
        paths: Object.keys(paths).length,
      }),
    );

    return paths;
  });

export const generateAsync = async (
  options: GenerateOptions,
): Promise<OpenApiPaths> => {
  const program = generate(options).pipe(
    Effect.mapError((error) => new Error(error.message)),
  );
  return Effect.runPromise(program);
};
