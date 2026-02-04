import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { generate } from '../src/generate.js';
import {
  OpenApiModule,
  OPENAPI_MODULE_OPTIONS,
  OPENAPI_SPEC,
} from '../src/module.js';

describe('OpenApiModule E2E', () => {
  const configPath = 'e2e-applications/openapi-module-demo/openapi.config.ts';
  const specPath =
    'e2e-applications/openapi-module-demo/openapi.generated.json';

  // Generate the spec before tests
  beforeAll(async () => {
    await generate(configPath);
  });

  describe('Module Configuration', () => {
    it('should create module with JSON endpoint when enabled', async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [
          OpenApiModule.forRoot({
            specFile: specPath,
            enabled: true,
          }),
        ],
      }).compile();

      const options = moduleRef.get(OPENAPI_MODULE_OPTIONS);
      const spec = moduleRef.get(OPENAPI_SPEC);

      expect(options).toBeDefined();
      expect(options.enabled).toBe(true);
      expect(options.jsonPath).toBe('/openapi.json');
      expect(options.swagger.enabled).toBe(false);

      expect(spec).toBeDefined();
      expect(spec.openapi).toBe('3.0.3');
      expect(spec.info.title).toBe('Products API');
    });

    it('should create module with Swagger UI when swagger: true', async () => {
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
    });

    it('should create module with Swagger UI when swagger object provided', async () => {
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

    it('should return empty module when disabled', async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [
          OpenApiModule.forRoot({
            specFile: specPath,
            enabled: false,
          }),
        ],
      }).compile();

      // The module should compile but providers shouldn't be available
      expect(() => moduleRef.get(OPENAPI_SPEC)).toThrow();
    });
  });

  describe('Generated Spec Content', () => {
    let spec: Record<string, unknown>;

    beforeAll(async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [
          OpenApiModule.forRoot({
            specFile: specPath,
          }),
        ],
      }).compile();

      spec = moduleRef.get(OPENAPI_SPEC);
    });

    it('should include interface-based DTO schemas', () => {
      const schemas = (spec.components as Record<string, unknown>)
        ?.schemas as Record<string, unknown>;

      expect(schemas).toBeDefined();
      expect(schemas.CreateProductDto).toBeDefined();
      expect(schemas.ProductCategory).toBeDefined();
    });

    it('should have correct schema structure for CreateProductDto', () => {
      const schemas = (spec.components as Record<string, unknown>)
        ?.schemas as Record<string, unknown>;
      const createProductDto = schemas.CreateProductDto as Record<
        string,
        unknown
      >;

      expect(createProductDto.type).toBe('object');
      expect(createProductDto.properties).toBeDefined();
      expect(createProductDto.required).toContain('name');
      expect(createProductDto.required).toContain('price');
      expect(createProductDto.required).toContain('category');
    });

    it('should have correct enum schema for ProductCategory', () => {
      const schemas = (spec.components as Record<string, unknown>)
        ?.schemas as Record<string, unknown>;
      const productCategory = schemas.ProductCategory as Record<
        string,
        unknown
      >;

      expect(productCategory.type).toBe('string');
      expect(productCategory.enum).toEqual([
        'electronics',
        'clothing',
        'food',
        'other',
      ]);
    });

    it('should have paths for product endpoints', () => {
      const paths = spec.paths as Record<string, unknown>;

      expect(paths['/products']).toBeDefined();
      expect(paths['/products/{id}']).toBeDefined();
    });

    it('should include servers array (even if empty)', () => {
      // NestJS Swagger always includes servers array
      expect(spec.servers).toBeDefined();
      expect(Array.isArray(spec.servers)).toBe(true);
    });

    it('should include tags array (even if empty)', () => {
      // NestJS Swagger always includes tags array
      expect(spec.tags).toBeDefined();
      expect(Array.isArray(spec.tags)).toBe(true);
    });

    it('should have all required top-level OpenAPI keys', () => {
      // Verify the spec matches NestJS Swagger structure
      expect(spec).toHaveProperty('openapi');
      expect(spec).toHaveProperty('info');
      expect(spec).toHaveProperty('servers');
      expect(spec).toHaveProperty('paths');
      expect(spec).toHaveProperty('components');
      expect(spec).toHaveProperty('tags');
    });

    it('should reference CreateProductDto in POST request body', () => {
      const paths = spec.paths as Record<string, Record<string, unknown>>;
      const postOperation = paths['/products'].post as Record<string, unknown>;
      const requestBody = postOperation.requestBody as Record<string, unknown>;
      const content = requestBody.content as Record<
        string,
        Record<string, unknown>
      >;
      const schema = content['application/json'].schema as Record<
        string,
        string
      >;

      expect(schema.$ref).toBe('#/components/schemas/CreateProductDto');
    });
  });

  describe('HTTP Routing', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [
          OpenApiModule.forRoot({
            specFile: specPath,
            swagger: true,
          }),
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app?.close();
    });

    it('should serve OpenAPI JSON at /openapi.json', async () => {
      const response = await request(app.getHttpServer())
        .get('/openapi.json')
        .expect(200)
        .expect('Content-Type', /application\/json/);

      expect(response.body).toHaveProperty('openapi');
      expect(response.body).toHaveProperty('info');
      expect(response.body.info.title).toBe('Products API');
    });

    it('should serve Swagger UI at /api-docs', async () => {
      const response = await request(app.getHttpServer())
        .get('/api-docs')
        .expect(200)
        .expect('Content-Type', /text\/html/);

      expect(response.text).toContain('<!DOCTYPE html>');
      expect(response.text).toContain('swagger-ui');
    });
  });

  describe('HTTP Routing with custom paths', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [
          OpenApiModule.forRoot({
            specFile: specPath,
            jsonPath: '/api/spec.json',
            swagger: {
              path: '/docs',
              title: 'Custom API Docs',
            },
          }),
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app?.close();
    });

    it('should serve OpenAPI JSON at custom path', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/spec.json')
        .expect(200);

      expect(response.body).toHaveProperty('openapi');
    });

    it('should serve Swagger UI at custom path', async () => {
      const response = await request(app.getHttpServer())
        .get('/docs')
        .expect(200);

      expect(response.text).toContain('swagger-ui');
      expect(response.text).toContain('Custom API Docs');
    });

    it('should reference correct JSON path in Swagger UI', async () => {
      const response = await request(app.getHttpServer())
        .get('/docs')
        .expect(200);

      expect(response.text).toContain('/api/spec.json');
    });
  });
});
