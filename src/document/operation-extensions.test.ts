import { describe, it, expect } from 'vitest';
import { Effect, Either, Option } from 'effect';
import { applyOperationExtensions } from './operation-extensions.js';
import { transformMethods } from './transformer.js';
import type { OperationExtensionsHook } from '../config/types.js';
import type { MethodInfo } from '../model/domain.js';

const method = (overrides: Partial<MethodInfo> = {}): MethodInfo => ({
  httpMethod: 'GET',
  path: '/books/:id',
  methodName: 'get',
  controllerName: 'BooksController',
  controllerTags: [],
  returnType: {
    type: Option.none(),
    inline: Option.none(),
    container: Option.none(),
    filePath: Option.none(),
  },
  parameters: [],
  decorators: [],
  operation: {
    summary: Option.none(),
    description: Option.none(),
    operationId: Option.none(),
    deprecated: Option.none(),
  },
  responses: [],
  httpCode: Option.none(),
  consumes: [],
  produces: [],
  security: [],
  source: {
    entry: 'src/app.module.ts',
    module: 'BooksModule',
    methodDecorators: [{ name: 'Roles', args: ['admin'] }],
    controllerDecorators: [],
  },
  ...overrides,
});

const run = (methods: readonly MethodInfo[], hook: OperationExtensionsHook) =>
  Effect.runSync(
    Effect.either(
      applyOperationExtensions(transformMethods(methods), methods, hook),
    ),
  );

describe('applyOperationExtensions', () => {
  it('adds the returned extensions and keeps @ApiExtension values', () => {
    const result = run(
      [method({ extensions: { 'x-owner': 'catalog' } })],
      () => ({
        'x-owner': 'platform',
        'x-roles': ['admin'],
        'x-skipped': undefined,
      }),
    );

    const operation = Either.getOrThrow(result)['/books/{id}']?.['get'];
    expect(operation).toMatchObject({
      'x-owner': 'catalog',
      'x-roles': ['admin'],
    });
    expect(operation).not.toHaveProperty('x-skipped');
  });

  it('leaves the operation unchanged when the hook returns undefined', () => {
    const methods = [method()];

    const result = run(methods, () => undefined);

    expect(Either.getOrThrow(result)).toEqual(transformMethods(methods));
  });

  it('fails on a name without the x- prefix, naming the operation', () => {
    const result = run([method()], () => ({ owner: 'catalog' }) as never);

    expect(Either.isLeft(result) && result.left.message).toBe(
      'options.operationExtensions returned "owner" for GET /books/{id} (BooksController_get); extension names must start with "x-"',
    );
  });

  it('fails with the operation when the hook throws', () => {
    const result = run([method()], () => {
      throw new Error('no owner');
    });

    expect(Either.isLeft(result) && result.left.message).toBe(
      'options.operationExtensions failed for GET /books/{id} (BooksController_get): no owner',
    );
  });
});
