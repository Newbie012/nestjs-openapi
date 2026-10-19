import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'path';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { generate } from '../src/document/generate.js';
import type { OpenApiSpec } from '../src/config/types.js';

describe('operationExtensions E2E', () => {
  const fixtureDir = resolve(
    process.cwd(),
    'e2e-applications/operation-extensions',
  );
  const outputPath = resolve(fixtureDir, 'openapi.generated.json');
  let spec: OpenApiSpec;

  const operation = (path: string, method: string) =>
    (spec.paths[path] as unknown as Record<string, Record<string, unknown>>)[
      method
    ]!;

  beforeAll(async () => {
    await generate(resolve(fixtureDir, 'openapi.config.ts'));
    spec = JSON.parse(readFileSync(outputPath, 'utf-8'));
  });

  afterAll(() => {
    if (existsSync(outputPath)) unlinkSync(outputPath);
  });

  it('passes the operation, its module, its entry and its decorators to the hook', () => {
    expect(operation('/api/orders', 'post')['x-context']).toEqual({
      httpMethod: 'post',
      path: '/api/orders',
      operationId: 'OrdersController_create',
      controller: 'OrdersController',
      method: 'create',
      module: 'OrdersModule',
      entry: 'src/orders/orders.module.ts',
      decorators: {
        method: [
          { name: 'Post', args: [] },
          { name: 'Roles', args: ['admin', 'support'] },
          { name: 'RateLimit', args: [{ perMinute: 10 }] },
        ],
        controller: [{ name: 'Controller', args: ['orders'] }],
      },
    });
    expect(operation('/api/users/{id}', 'get')['x-context']).toMatchObject({
      module: 'UsersModule',
      entry: 'src/users/users.module.ts',
      decorators: {
        controller: [
          { name: 'Controller', args: ['users'] },
          { name: 'Roles', args: ['admin'] },
          { name: 'ApiExtension', args: ['x-owner', 'accounts'] },
        ],
      },
    });
  });

  it('merges the returned extensions into each operation', () => {
    expect(operation('/api/orders', 'post')).toMatchObject({
      'x-owner': 'platform',
      'x-roles': ['admin', 'support'],
      'x-rate-limit': { perMinute: 10 },
    });
    expect(operation('/api/users', 'get')['x-roles']).toEqual(['admin']);
    expect(operation('/api/orders', 'get')).not.toHaveProperty('x-roles');
  });

  it('keeps @ApiExtension values over the returned ones', () => {
    expect(operation('/api/users', 'get')['x-owner']).toBe('accounts');
    expect(operation('/api/users/{id}', 'get')['x-owner']).toBe('profiles');
    expect(operation('/api/orders', 'get')['x-owner']).toBe('platform');
  });
});
