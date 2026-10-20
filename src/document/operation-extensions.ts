import { Effect } from 'effect';
import { OperationExtensionsError } from '../config/errors.js';
import type {
  OpenApiPaths,
  OperationContext,
  OperationExtensionsHook,
} from '../config/types.js';
import type { MethodInfo } from '../model/domain.js';
import { toOpenApiPath } from './transformer.js';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Merges what `operationExtensions` returns into each operation. Keys set
 * with `@ApiExtension` stay as they are.
 */
export const applyOperationExtensions = Effect.fn(
  'Generate.applyOperationExtensions',
)(function* (
  paths: OpenApiPaths,
  methods: readonly MethodInfo[],
  hook: OperationExtensionsHook,
) {
  const byOperation = new Map<string, MethodInfo>();
  for (const method of methods) {
    byOperation.set(
      `${method.httpMethod.toLowerCase()} ${toOpenApiPath(method.path)}`,
      method,
    );
  }

  const result: Record<string, Record<string, unknown>> = { ...paths };
  for (const [key, method] of byOperation) {
    const source = method.source;
    if (!source) continue;
    const separator = key.indexOf(' ');
    const httpMethod = key.slice(0, separator);
    const path = key.slice(separator + 1);
    const operation = result[path]?.[httpMethod] as
      | Record<string, unknown>
      | undefined;
    if (!operation) continue;

    const operationId = String(operation.operationId);
    const context: OperationContext = {
      httpMethod,
      path,
      operationId,
      controller: method.controllerName,
      method: method.methodName,
      module: source.module,
      entry: source.entry,
      decorators: {
        method: source.methodDecorators,
        controller: source.controllerDecorators,
      },
    };

    const extensions = yield* Effect.try({
      try: () => hook(context),
      catch: (cause) =>
        new OperationExtensionsError({
          message: `options.operationExtensions failed for ${httpMethod.toUpperCase()} ${path} (${operationId}): ${cause instanceof Error ? cause.message : String(cause)}`,
          operationId,
          cause,
        }),
    });
    if (extensions === undefined || extensions === null) continue;
    if (!isPlainObject(extensions)) {
      return yield* new OperationExtensionsError({
        message: `options.operationExtensions must return an object or undefined, got ${typeof extensions} for ${httpMethod.toUpperCase()} ${path} (${operationId})`,
        operationId,
      });
    }
    const invalid = Object.keys(extensions).filter(
      (name) => !name.startsWith('x-'),
    );
    if (invalid.length > 0) {
      return yield* new OperationExtensionsError({
        message: `options.operationExtensions returned ${invalid.map((name) => `"${name}"`).join(', ')} for ${httpMethod.toUpperCase()} ${path} (${operationId}); extension names must start with "x-"`,
        operationId,
      });
    }

    const added = Object.fromEntries(
      Object.entries(extensions).filter(
        ([name, value]) =>
          value !== undefined && !(name in (method.extensions ?? {})),
      ),
    );
    if (Object.keys(added).length === 0) continue;
    result[path] = {
      ...result[path],
      [httpMethod]: { ...operation, ...added },
    };
  }

  return result as unknown as OpenApiPaths;
});
