import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  OpenApiModule,
  loadSpecFile,
  generateSwaggerUiHtml,
  resolveOptions,
  OPENAPI_MODULE_OPTIONS,
  OPENAPI_SPEC,
  type OpenApiModuleOptions,
} from './module.js';
import type { OpenApiSpec } from './types.js';

// Sample OpenAPI spec for testing
const sampleSpec: OpenApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Test API',
    version: '1.0.0',
    description: 'A test API',
  },
  paths: {
    '/users': {
      get: {
        operationId: 'getUsers',
        summary: 'Get all users',
        responses: {
          '200': {
            description: 'Successful response',
          },
        },
      },
    },
  },
};

describe('resolveOptions', () => {
  it('should apply default values', () => {
    const options: OpenApiModuleOptions = {
      filePath: 'openapi.json',
    };

    const resolved = resolveOptions(options);

    expect(resolved).toEqual({
      filePath: 'openapi.json',
      enabled: true,
      jsonPath: '/openapi.json',
      serveSwaggerUi: false,
      swaggerUiPath: '/api-docs',
      swaggerUiTitle: '',
    });
  });

  it('should preserve provided values', () => {
    const options: OpenApiModuleOptions = {
      filePath: 'custom/spec.json',
      enabled: false,
      jsonPath: '/spec.json',
      serveSwaggerUi: true,
      swaggerUiPath: '/docs',
      swaggerUiTitle: 'My API Docs',
    };

    const resolved = resolveOptions(options);

    expect(resolved).toEqual({
      filePath: 'custom/spec.json',
      enabled: false,
      jsonPath: '/spec.json',
      serveSwaggerUi: true,
      swaggerUiPath: '/docs',
      swaggerUiTitle: 'My API Docs',
    });
  });

  it('should handle partial overrides', () => {
    const options: OpenApiModuleOptions = {
      filePath: 'openapi.json',
      serveSwaggerUi: true,
    };

    const resolved = resolveOptions(options);

    expect(resolved.enabled).toBe(true);
    expect(resolved.serveSwaggerUi).toBe(true);
    expect(resolved.swaggerUiPath).toBe('/api-docs');
  });
});

describe('loadSpecFile', () => {
  const tempDir = join(process.cwd(), '.test-temp');
  const specPath = join(tempDir, 'test-spec.json');

  beforeEach(() => {
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
    writeFileSync(specPath, JSON.stringify(sampleSpec, null, 2));
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  it('should load a valid spec file', () => {
    const spec = loadSpecFile('.test-temp/test-spec.json');

    expect(spec.openapi).toBe('3.0.3');
    expect(spec.info.title).toBe('Test API');
    expect(spec.paths['/users']).toBeDefined();
  });

  it('should throw an error for non-existent file', () => {
    expect(() => loadSpecFile('non-existent.json')).toThrow(
      'OpenAPI spec file not found',
    );
  });

  it('should throw an error for invalid JSON', () => {
    const invalidPath = join(tempDir, 'invalid.json');
    writeFileSync(invalidPath, '{ invalid json }');

    expect(() => loadSpecFile('.test-temp/invalid.json')).toThrow(
      'Failed to load OpenAPI spec',
    );
  });
});

describe('generateSwaggerUiHtml', () => {
  it('should generate valid HTML with title and jsonPath', () => {
    const html = generateSwaggerUiHtml('My API', '/openapi.json');

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>My API</title>');
    expect(html).toContain('url: "/openapi.json"');
    expect(html).toContain('swagger-ui-bundle.js');
    expect(html).toContain('swagger-ui.css');
  });

  it('should escape HTML special characters in title', () => {
    const html = generateSwaggerUiHtml('<script>alert("xss")</script>', '/api');

    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
  });

  it('should escape HTML special characters in jsonPath', () => {
    const html = generateSwaggerUiHtml('API', '"/></script><script>alert(1)');

    expect(html).not.toContain('</script><script>alert(1)');
    expect(html).toContain('&quot;/&gt;&lt;/script&gt;&lt;script&gt;alert(1)');
  });
});

describe('OpenApiModule.forRoot', () => {
  const tempDir = join(process.cwd(), '.test-temp');
  const specPath = join(tempDir, 'openapi.json');

  beforeEach(() => {
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
    writeFileSync(specPath, JSON.stringify(sampleSpec, null, 2));
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  it('should return empty module when disabled', () => {
    const module = OpenApiModule.forRoot({
      filePath: '.test-temp/openapi.json',
      enabled: false,
    });

    expect(module.providers).toHaveLength(0);
    expect(module.controllers).toHaveLength(0);
    expect(module.exports).toHaveLength(0);
  });

  it('should configure module when enabled', () => {
    const module = OpenApiModule.forRoot({
      filePath: '.test-temp/openapi.json',
      enabled: true,
    });

    expect(module.providers).toHaveLength(2);
    expect(module.controllers).toHaveLength(1); // Only JSON controller
    expect(module.exports).toContain(OPENAPI_MODULE_OPTIONS);
    expect(module.exports).toContain(OPENAPI_SPEC);
  });

  it('should add Swagger UI controller when enabled', () => {
    const module = OpenApiModule.forRoot({
      filePath: '.test-temp/openapi.json',
      serveSwaggerUi: true,
    });

    expect(module.controllers).toHaveLength(2); // JSON + Swagger UI
  });

  it('should provide spec from file', () => {
    const module = OpenApiModule.forRoot({
      filePath: '.test-temp/openapi.json',
    });

    const specProvider = module.providers?.find(
      (p) =>
        typeof p === 'object' && 'provide' in p && p.provide === OPENAPI_SPEC,
    );

    expect(specProvider).toBeDefined();
    if (
      specProvider &&
      typeof specProvider === 'object' &&
      'useValue' in specProvider
    ) {
      const spec = specProvider.useValue as OpenApiSpec;
      expect(spec.info.title).toBe('Test API');
    }
  });

  it('should provide resolved options', () => {
    const module = OpenApiModule.forRoot({
      filePath: '.test-temp/openapi.json',
      jsonPath: '/custom-spec.json',
    });

    const optionsProvider = module.providers?.find(
      (p) =>
        typeof p === 'object' &&
        'provide' in p &&
        p.provide === OPENAPI_MODULE_OPTIONS,
    );

    expect(optionsProvider).toBeDefined();
    if (
      optionsProvider &&
      typeof optionsProvider === 'object' &&
      'useValue' in optionsProvider
    ) {
      const options = optionsProvider.useValue as {
        jsonPath: string;
        swaggerUiTitle: string;
      };
      expect(options.jsonPath).toBe('/custom-spec.json');
      // Title should be set from spec if not provided
      expect(options.swaggerUiTitle).toBe('Test API');
    }
  });

  it('should use custom swaggerUiTitle when provided', () => {
    const module = OpenApiModule.forRoot({
      filePath: '.test-temp/openapi.json',
      swaggerUiTitle: 'Custom Title',
    });

    const optionsProvider = module.providers?.find(
      (p) =>
        typeof p === 'object' &&
        'provide' in p &&
        p.provide === OPENAPI_MODULE_OPTIONS,
    );

    if (
      optionsProvider &&
      typeof optionsProvider === 'object' &&
      'useValue' in optionsProvider
    ) {
      const options = optionsProvider.useValue as { swaggerUiTitle: string };
      expect(options.swaggerUiTitle).toBe('Custom Title');
    }
  });

  it('should throw error when file not found', () => {
    expect(() =>
      OpenApiModule.forRoot({
        filePath: 'non-existent.json',
      }),
    ).toThrow('OpenAPI spec file not found');
  });
});
