import 'reflect-metadata';
import { describe, it, expect, beforeAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { generate } from '../src/generate.js';
import {
  OpenApiModule,
  OPENAPI_MODULE_OPTIONS,
  OPENAPI_SPEC,
} from '../src/module.js';

describe('Swagger Demo E2E', () => {
  const configPath = 'e2e-applications/swagger-demo/openapi.config.ts';
  const specPath = 'e2e-applications/swagger-demo/openapi.generated.json';

  // Generate the spec before tests
  beforeAll(async () => {
    await generate(configPath);
  });

  describe('Swagger Configuration', () => {
    it('should enable swagger with swagger: true', async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [
          OpenApiModule.forRoot({
            specFile: specPath,
            swagger: true,
          }),
        ],
      }).compile();

      const options = moduleRef.get(OPENAPI_MODULE_OPTIONS);

      expect(options.swagger.enabled).toBe(true);
      expect(options.swagger.path).toBe('/api-docs');
      expect(options.swagger.title).toBe('Users API'); // From spec
    });

    it('should enable swagger with custom path', async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [
          OpenApiModule.forRoot({
            specFile: specPath,
            swagger: { path: '/docs' },
          }),
        ],
      }).compile();

      const options = moduleRef.get(OPENAPI_MODULE_OPTIONS);

      expect(options.swagger.enabled).toBe(true);
      expect(options.swagger.path).toBe('/docs');
    });

    it('should enable swagger with custom title', async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [
          OpenApiModule.forRoot({
            specFile: specPath,
            swagger: { title: 'Custom API Docs' },
          }),
        ],
      }).compile();

      const options = moduleRef.get(OPENAPI_MODULE_OPTIONS);

      expect(options.swagger.enabled).toBe(true);
      expect(options.swagger.title).toBe('Custom API Docs');
    });

    it('should disable swagger when not specified', async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [
          OpenApiModule.forRoot({
            specFile: specPath,
          }),
        ],
      }).compile();

      const options = moduleRef.get(OPENAPI_MODULE_OPTIONS);

      expect(options.swagger.enabled).toBe(false);
    });

    it('should disable swagger with swagger: false', async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [
          OpenApiModule.forRoot({
            specFile: specPath,
            swagger: false,
          }),
        ],
      }).compile();

      const options = moduleRef.get(OPENAPI_MODULE_OPTIONS);

      expect(options.swagger.enabled).toBe(false);
    });
  });

  describe('Generated Spec Content', () => {
    let spec: Record<string, unknown>;

    beforeAll(async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [
          OpenApiModule.forRoot({
            specFile: specPath,
            swagger: true,
          }),
        ],
      }).compile();

      spec = moduleRef.get(OPENAPI_SPEC);
    });

    it('should have correct info', () => {
      const info = spec.info as Record<string, unknown>;

      expect(info.title).toBe('Users API');
      expect(info.version).toBe('1.0.0');
    });

    it('should include user schemas', () => {
      const schemas = (spec.components as Record<string, unknown>)
        ?.schemas as Record<string, unknown>;

      expect(schemas).toBeDefined();
      expect(schemas.UserDto).toBeDefined();
      expect(schemas.CreateUserDto).toBeDefined();
      expect(schemas.UpdateUserDto).toBeDefined();
      expect(schemas.UserRole).toBeDefined();
    });

    it('should have paths for user endpoints', () => {
      const paths = spec.paths as Record<string, unknown>;

      expect(paths['/users']).toBeDefined();
      expect(paths['/users/{id}']).toBeDefined();
    });

    it('should have CRUD operations', () => {
      const paths = spec.paths as Record<string, Record<string, unknown>>;

      // GET /users
      expect(paths['/users'].get).toBeDefined();
      // POST /users
      expect(paths['/users'].post).toBeDefined();
      // GET /users/{id}
      expect(paths['/users/{id}'].get).toBeDefined();
      // PUT /users/{id}
      expect(paths['/users/{id}'].put).toBeDefined();
      // DELETE /users/{id}
      expect(paths['/users/{id}'].delete).toBeDefined();
    });
  });
});
