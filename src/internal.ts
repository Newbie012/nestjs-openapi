/**
 * Internal Effect-based APIs.
 *
 * This module keeps low-level Effect entry points for advanced usage.
 */

import { Effect } from 'effect';
import type { OpenApiPaths } from './model/domain.js';
import { getControllerMethodInfos } from './analysis/methods.js';
import { getModules } from './analysis/modules.js';
import { makeProjectContext } from './analysis/project.js';
import { runProjectApiPromise } from './public-api.js';
import { transformMethods } from './document/transformer.js';

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

    const { entryClass } = yield* makeProjectContext(options);
    const modules = yield* getModules(entryClass);

    const flatMethodInfos = modules
      .flatMap((mod) => mod.controllers)
      .flatMap((controller) => getControllerMethodInfos(controller));

    yield* Effect.logInfo('Collected method infos').pipe(
      Effect.annotateLogs({
        modules: modules.length,
        methods: flatMethodInfos.length,
      }),
    );

    const paths = transformMethods(flatMethodInfos);

    yield* Effect.logInfo('OpenAPI generation complete').pipe(
      Effect.annotateLogs({ paths: Object.keys(paths).length }),
    );

    return paths;
  },
);

/**
 * Promise wrapper for path-only API.
 */
export const generatePathsAsync = (
  options: GenerateOptions,
): Promise<OpenApiPaths> => runProjectApiPromise(generatePathsEffect(options));

/**
 * Backward-compatible aliases.
 */
export const generate = generatePathsEffect;
export const generateAsync = generatePathsAsync;
