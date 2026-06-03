import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'path';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { generateAsync } from '../src/internal.js';
import { generate } from '../src/generate.js';
import type { OpenApiSpec } from '../src/types.js';

const apps = [
  ['monolith-todo-app', 'e2e-applications/monolith-todo-app/src/app.module.ts'],
  [
    'user-service',
    'e2e-applications/microservices/apps/user-service/src/app.module.ts',
  ],
  [
    'notification-service',
    'e2e-applications/microservices/apps/notification-service/src/app.module.ts',
  ],
  [
    'api-gateway',
    'e2e-applications/microservices/apps/api-gateway/src/app.module.ts',
  ],
  ['complex-generics', 'e2e-applications/complex-generics/src/app.module.ts'],
];

describe('OpenAPI generation for E2E apps', () => {
  it.each(apps)(
    'should generate OpenAPI spec for %s that matches snapshot',
    async (name, entry) => {
      const openApi = await generateAsync({
        tsconfig: resolve(process.cwd(), 'tsconfig.json'),
        entry: resolve(process.cwd(), entry),
      });

      expect(openApi).toMatchSnapshot(`${name}-openapi`);
    },
  );

  describe('Optional query params with strictNullChecks', () => {
    let spec: any;

    beforeAll(async () => {
      spec = await generateAsync({
        tsconfig: resolve(process.cwd(), 'tsconfig.json'),
        entry: resolve(
          process.cwd(),
          'e2e-applications/monolith-todo-app/src/app.module.ts',
        ),
      });
    });

    it('should produce clean primitive schema, not oneOf with object', () => {
      const params = spec['/api/users'].get.parameters;
      const search = params.find((p: any) => p.name === 'search');

      expect(search.required).toBe(false);
      expect(search.schema).toEqual({ type: 'string' });
    });

    it('keeps the 204 success response for a void DELETE that only declares an error response', () => {
      const responses = spec['/api/users/{id}'].delete.responses;

      expect(Object.keys(responses).sort()).toEqual(['204', '409']);
      expect(responses['204'].content).toBeUndefined();
    });
  });

  describe('Typed error response in the full document', () => {
    const configPath = resolve(
      process.cwd(),
      'e2e-applications/monolith-todo-app/openapi.config.ts',
    );
    const outputPath = resolve(
      process.cwd(),
      'e2e-applications/monolith-todo-app/openapi.generated.json',
    );

    let spec: OpenApiSpec;

    beforeAll(async () => {
      await generate(configPath);
      spec = JSON.parse(readFileSync(outputPath, 'utf-8'));
    });

    afterAll(() => {
      if (existsSync(outputPath)) {
        unlinkSync(outputPath);
      }
    });

    it('references the typed error DTO from the declared 409 response', () => {
      const conflict = spec.paths['/api/users/{id}'].delete.responses['409'];

      expect(conflict.content?.['application/json'].schema).toEqual({
        $ref: '#/components/schemas/DeleteUserConflictDto',
      });
    });

    it('hoists the error DTO into components.schemas with its property shape', () => {
      expect(spec.components?.schemas?.DeleteUserConflictDto).toMatchObject({
        type: 'object',
        properties: {
          statusCode: { type: 'number' },
          code: { const: 'USER_HAS_TODOS', type: 'string' },
          message: { type: 'string' },
        },
        required: ['statusCode', 'code', 'message'],
      });
    });
  });
});
