import { describe, it, expect, afterEach } from 'vitest';
import { resolve } from 'path';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { generate } from '../src/generate.js';
import type { OpenApiSpec } from '../src/types.js';

describe('Exclude Decorators E2E', () => {
  const configPath = resolve(
    process.cwd(),
    'e2e-applications/exclude-decorators/openapi.config.ts',
  );
  const outputPath = resolve(
    process.cwd(),
    'e2e-applications/exclude-decorators/openapi.generated.json',
  );

  afterEach(() => {
    // Clean up generated file
    if (existsSync(outputPath)) {
      unlinkSync(outputPath);
    }
  });

  it('should generate OpenAPI spec with filtered endpoints', async () => {
    const result = await generate(configPath);

    expect(result.outputPath).toBe(outputPath);
    expect(existsSync(outputPath)).toBe(true);

    const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

    // Verify basic spec structure
    expect(spec.openapi).toBe('3.0.3');
    expect(spec.info.title).toBe('Exclude Decorators Test API');
    expect(spec.info.version).toBe('1.0.0');
  });

  describe('Public endpoints', () => {
    it('should include public ItemsController endpoints', async () => {
      await generate(configPath);

      const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      // Public endpoints should be included
      expect(spec.paths['/items']).toBeDefined();
      expect(spec.paths['/items'].get).toBeDefined();
      expect(spec.paths['/items'].post).toBeDefined();

      expect(spec.paths['/items/{id}']).toBeDefined();
      expect(spec.paths['/items/{id}'].get).toBeDefined();
    });

    it('should include public AdminController endpoint', async () => {
      await generate(configPath);

      const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      // Public admin endpoint should be included
      expect(spec.paths['/admin/config']).toBeDefined();
      expect(spec.paths['/admin/config'].get).toBeDefined();
    });

    it('should include PublicApiController endpoints', async () => {
      await generate(configPath);

      const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      // Public API endpoints should be included
      expect(spec.paths['/api/public/info']).toBeDefined();
      expect(spec.paths['/api/public/info'].get).toBeDefined();

      expect(spec.paths['/api/public/status']).toBeDefined();
      expect(spec.paths['/api/public/status'].get).toBeDefined();
    });
  });

  describe('@Internal decorator filtering', () => {
    it('should exclude endpoints with @Internal decorator', async () => {
      await generate(configPath);

      const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      // Endpoints with @Internal should be excluded
      expect(spec.paths['/items/internal/stats']).toBeUndefined();
      expect(spec.paths['/admin/health']).toBeUndefined();
      expect(spec.paths['/admin/metrics']).toBeUndefined();
    });
  });

  describe('@ApiExcludeEndpoint decorator filtering', () => {
    it('should exclude endpoints with @ApiExcludeEndpoint', async () => {
      await generate(configPath);

      const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      // DELETE endpoint should be excluded due to @ApiExcludeEndpoint
      // The path /items/{id} should exist (for GET) but not have DELETE
      expect(spec.paths['/items/{id}']).toBeDefined();
      expect(spec.paths['/items/{id}'].delete).toBeUndefined();
    });
  });

  describe('pathFilter filtering', () => {
    it('should exclude versioned paths matching the filter', async () => {
      await generate(configPath);

      const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      // Versioned paths like /v2/legacy/* should be excluded
      expect(spec.paths['/v2/legacy/data']).toBeUndefined();

      // Non-versioned paths should still be included
      expect(spec.paths['/items']).toBeDefined();
      expect(spec.paths['/api/public/info']).toBeDefined();
    });
  });

  describe('Operation metadata', () => {
    it('should have correct operation metadata for included endpoints', async () => {
      await generate(configPath);

      const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      // Check operation metadata
      const getItemsOp = spec.paths['/items'].get;
      expect(getItemsOp.summary).toBe('Get all items');
      expect(getItemsOp.tags).toContain('Items');

      const getConfigOp = spec.paths['/admin/config'].get;
      expect(getConfigOp.summary).toBe('Get public configuration');
      expect(getConfigOp.tags).toContain('Admin');

      const getInfoOp = spec.paths['/api/public/info'].get;
      expect(getInfoOp.summary).toBe('Get public API info');
      expect(getInfoOp.tags).toContain('Public');
    });
  });

  describe('Tags', () => {
    it('should only include tags for non-excluded endpoints', async () => {
      await generate(configPath);

      const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      // Get all tags from the paths
      const pathTags = new Set<string>();
      for (const pathObj of Object.values(spec.paths)) {
        for (const operation of Object.values(pathObj)) {
          if (operation.tags) {
            for (const tag of operation.tags) {
              pathTags.add(tag);
            }
          }
        }
      }

      // Items, Admin, and Public should have endpoints
      expect(pathTags.has('Items')).toBe(true);
      expect(pathTags.has('Admin')).toBe(true);
      expect(pathTags.has('Public')).toBe(true);

      // Versioned tag should not appear since all its endpoints are filtered
      expect(pathTags.has('Versioned')).toBe(false);
    });
  });
});
