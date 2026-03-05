/**
 * Internal Effect-based APIs.
 *
 * This module keeps low-level Effect entry points for advanced usage.
 */

import { Effect } from 'effect';
import type { OpenApiPaths } from './domain.js';
import { type GeneratorError, type ProjectError } from './errors.js';
import { generateEffect, type GenerateResult } from './generate.js';
import { MethodExtractionService } from './methods.js';
import { ModuleTraversalService } from './modules.js';
import { ProjectService } from './project.js';
import {
  runGeneratorApiPromise,
  runProjectApiPromise,
} from './public-api.js';
import { runtimeLayerFor } from './runtime-layer.js';
import { generatorServicesLayer } from './service-layer.js';
import { transformMethodsEffect } from './transformer.js';
import type { GenerateOverrides } from './types.js';

export interface GenerateOptions {
  readonly tsconfig: string;
  readonly entry: string;
}

/**
 * Low-level path-only Effect API from entry + tsconfig.
 */
export const generatePathsEffect = Effect.fn('Internal.generatePathsEffect')(
  function* (options: GenerateOptions) {
    yield* Effect.logInfo('Starting OpenAPI generation').pipe(
      Effect.annotateLogs({ entry: options.entry }),
    );

    const { entryClass } = yield* ProjectService.makeProjectContext(options);
    const modules = yield* ModuleTraversalService.getModules(entryClass);

    const methodInfos = yield* Effect.forEach(
      modules.flatMap((mod) => mod.controllers),
      (controller) => MethodExtractionService.getControllerMethodInfos(controller),
      { concurrency: 'unbounded' },
    );
    const flatMethodInfos = methodInfos.flat();

    yield* Effect.logInfo('Collected method infos').pipe(
      Effect.annotateLogs({
        modules: modules.length,
        methods: flatMethodInfos.length,
      }),
    );

    const paths = yield* transformMethodsEffect(flatMethodInfos);

    yield* Effect.logInfo('OpenAPI generation complete').pipe(
      Effect.annotateLogs({ paths: Object.keys(paths).length }),
    );

    return paths;
  },
);

/**
 * Canonical config-file based Effect API.
 */
export const generateFromConfigEffect = generateEffect;

/**
 * Promise wrapper for path-only API.
 */
export const generatePathsAsync = async (
  options: GenerateOptions,
): Promise<OpenApiPaths> => {
  const program = generatePathsEffect(options) as Effect.Effect<
    OpenApiPaths,
    ProjectError,
    never
  >;
  return runProjectApiPromise(program.pipe(Effect.provide(generatorServicesLayer)));
};

/**
 * Promise wrapper for canonical config-file API.
 */
export const generateFromConfigAsync = async (
  configPath: string,
  overrides?: GenerateOverrides,
): Promise<GenerateResult> => {
  const program = generateFromConfigEffect(configPath, overrides).pipe(
    Effect.provide(generatorServicesLayer),
    Effect.provide(
      runtimeLayerFor(
        overrides?.debug ?? false,
        overrides?.telemetry,
      ),
    ),
  ) as Effect.Effect<GenerateResult, GeneratorError, never>;
  return runGeneratorApiPromise(program);
};

/**
 * Backward-compatible aliases.
 */
export const generate = generatePathsEffect;
export const generateAsync = generatePathsAsync;
