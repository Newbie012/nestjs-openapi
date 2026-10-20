import 'reflect-metadata';
import { describe, it, expect, beforeAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { generate } from '../src/document/generate.js';
import {
  OpenApiModule,
  OPENAPI_MODULE_OPTIONS,
} from '../src/runtime/module.js';

/**
 * The runtime module's swagger options against the generated spec file. The
 * document itself is pinned in test/contract/operations.
 */
describe('Swagger Demo E2E', () => {
  const configPath = 'e2e-applications/swagger-demo/openapi.config.ts';
  const specPath = 'e2e-applications/swagger-demo/openapi.generated.json';

  // Generate the spec before tests
  beforeAll(async () => {
    await generate(configPath);
  }, 30_000);

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
});
