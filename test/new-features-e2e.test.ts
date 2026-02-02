import { describe, it, expect, afterAll } from 'vitest';
import { generate } from '../src/generate.js';
import { resolve } from 'node:path';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';

describe('New Features E2E', () => {
  const generatedFiles: string[] = [];

  afterAll(() => {
    // Clean up generated files
    for (const file of generatedFiles) {
      if (existsSync(file)) {
        unlinkSync(file);
      }
    }
  });

  describe('Multi-entry config support', () => {
    const configPath = resolve(
      process.cwd(),
      'e2e-applications/multi-entry/openapi.config.ts',
    );
    const outputPath = resolve(
      process.cwd(),
      'e2e-applications/multi-entry/openapi.generated.json',
    );

    it('should generate spec from multiple entry modules', async () => {
      generatedFiles.push(outputPath);

      const result = await generate(configPath);

      expect(result.outputPath).toBe(outputPath);
      expect(existsSync(outputPath)).toBe(true);

      const spec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      // Should have paths from both modules
      expect(spec.paths).toHaveProperty('/users');
      expect(spec.paths).toHaveProperty('/users/{id}');
      expect(spec.paths).toHaveProperty('/products');

      // Verify operations from users module
      expect(spec.paths['/users'].get.summary).toBe('Get all users');
      expect(spec.paths['/users/{id}'].get.summary).toBe('Get user by ID');

      // Verify operations from products module
      expect(spec.paths['/products'].get.summary).toBe('Get all products');
      expect(spec.paths['/products'].post.summary).toBe('Create product');
    });

    it('should include tags from both modules', async () => {
      const spec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      // Check that paths have correct tags
      expect(spec.paths['/users'].get.tags).toContain('users');
      expect(spec.paths['/products'].get.tags).toContain('products');
    });

    it('should report correct path and operation counts', async () => {
      const result = await generate(configPath);

      // 3 unique paths: /users, /users/{id}, /products
      expect(result.pathCount).toBe(3);

      // 4 operations: GET /users, GET /users/{id}, GET /products, POST /products
      expect(result.operationCount).toBe(4);
    });
  });

  describe('Config extends support', () => {
    const configPath = resolve(
      process.cwd(),
      'e2e-applications/config-extends/openapi.config.ts',
    );
    const outputPath = resolve(
      process.cwd(),
      'e2e-applications/config-extends/openapi.generated.json',
    );

    it('should merge parent config with child config', async () => {
      generatedFiles.push(outputPath);

      const result = await generate(configPath);

      expect(result.outputPath).toBe(outputPath);
      expect(existsSync(outputPath)).toBe(true);

      const spec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      // Child overrides
      expect(spec.info.title).toBe('Extended API');
      expect(spec.info.version).toBe('2.0.0');

      // Parent values inherited
      expect(spec.info.description).toBe(
        'Base API description from parent config',
      );
      expect(spec.servers).toEqual([{ url: 'https://base.example.com' }]);
    });

    it('should apply inherited basePath', async () => {
      const spec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      // basePath from parent should be applied
      expect(spec.paths).toHaveProperty('/api/v1/app/health');
    });
  });

  describe('Inline return type extraction', () => {
    const configPath = resolve(
      process.cwd(),
      'e2e-applications/inline-types/openapi.config.ts',
    );
    const outputPath = resolve(
      process.cwd(),
      'e2e-applications/inline-types/openapi.generated.json',
    );

    it('should extract properties from simple inline types', async () => {
      generatedFiles.push(outputPath);

      await generate(configPath);

      const spec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      const schema =
        spec.paths['/inline/simple'].get.responses['200'].content[
          'application/json'
        ].schema;

      expect(schema.type).toBe('object');
      expect(schema.properties).toHaveProperty('name');
      expect(schema.properties).toHaveProperty('email');
      expect(schema.properties.name).toEqual({ type: 'string' });
      expect(schema.properties.email).toEqual({ type: 'string' });
      expect(schema.required).toContain('name');
      expect(schema.required).toContain('email');
    });

    it('should handle optional properties in inline types', async () => {
      const spec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      const schema =
        spec.paths['/inline/optional'].get.responses['200'].content[
          'application/json'
        ].schema;

      expect(schema.type).toBe('object');
      expect(schema.properties).toHaveProperty('id');
      expect(schema.properties).toHaveProperty('nickname');
      expect(schema.properties.id).toEqual({ type: 'number' });
      expect(schema.properties.nickname).toEqual({ type: 'string' });

      // Only 'id' should be required, not 'nickname'
      expect(schema.required).toContain('id');
      expect(schema.required).not.toContain('nickname');
    });

    it('should handle nested inline types', async () => {
      const spec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      const schema =
        spec.paths['/inline/nested'].get.responses['200'].content[
          'application/json'
        ].schema;

      expect(schema.type).toBe('object');
      expect(schema.properties).toHaveProperty('user');
      expect(schema.properties.user.type).toBe('object');
      expect(schema.properties.user.properties).toHaveProperty('name');
      expect(schema.properties.user.properties).toHaveProperty('age');
    });

    it('should handle array of inline objects', async () => {
      const spec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      const schema =
        spec.paths['/inline/array'].get.responses['200'].content[
          'application/json'
        ].schema;

      expect(schema.type).toBe('array');
      expect(schema.items.type).toBe('object');
      expect(schema.items.properties).toHaveProperty('id');
      expect(schema.items.properties).toHaveProperty('value');
    });
  });
});
