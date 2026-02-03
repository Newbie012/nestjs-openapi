import { describe, it, expect, afterEach } from 'vitest';
import { resolve } from 'path';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { generate } from '../src/generate.js';
import type { OpenApiSpec } from '../src/types.js';

describe('Query DTO Inlining E2E', () => {
  const baseDir = resolve(process.cwd(), 'e2e-applications/query-dto-inlining');
  const inlineConfigPath = resolve(baseDir, 'openapi.config.ts');
  const schemaRefsConfigPath = resolve(
    baseDir,
    'openapi-schema-refs.config.ts',
  );
  const inlineOutputPath = resolve(baseDir, 'openapi.generated.json');
  const schemaRefsOutputPath = resolve(
    baseDir,
    'openapi-schema-refs.generated.json',
  );

  afterEach(() => {
    // Clean up generated files
    if (existsSync(inlineOutputPath)) {
      unlinkSync(inlineOutputPath);
    }
    if (existsSync(schemaRefsOutputPath)) {
      unlinkSync(schemaRefsOutputPath);
    }
  });

  describe('Default behavior (inlining enabled)', () => {
    it('should inline PaginationQueryDto properties as individual parameters', async () => {
      await generate(inlineConfigPath);

      const spec: OpenApiSpec = JSON.parse(
        readFileSync(inlineOutputPath, 'utf-8'),
      );

      const params = spec.paths['/items'].get?.parameters ?? [];
      const paramNames = params.map((p) => p.name);

      // Should have individual params from PaginationQueryDto
      expect(paramNames).toContain('page');
      expect(paramNames).toContain('limit');
      expect(paramNames).toContain('sortBy');

      // Should NOT have a parameter named '_pagination' or 'pagination'
      expect(paramNames).not.toContain('pagination');
      expect(paramNames).not.toContain('_pagination');

      // All should be query params and optional
      const pageParam = params.find((p) => p.name === 'page');
      expect(pageParam?.in).toBe('query');
      expect(pageParam?.required).toBe(false);
    });

    it('should correctly mark required vs optional properties', async () => {
      await generate(inlineConfigPath);

      const spec: OpenApiSpec = JSON.parse(
        readFileSync(inlineOutputPath, 'utf-8'),
      );

      // FilterQueryDto has 'search' as required, others as optional
      const params = spec.paths['/items/search'].get?.parameters ?? [];

      const searchParam = params.find((p) => p.name === 'search');
      const categoryParam = params.find((p) => p.name === 'category');
      const statusParam = params.find((p) => p.name === 'status');

      expect(searchParam).toBeDefined();
      expect(searchParam?.required).toBe(true); // Required field

      expect(categoryParam).toBeDefined();
      expect(categoryParam?.required).toBe(false); // Optional field

      expect(statusParam).toBeDefined();
      expect(statusParam?.required).toBe(false); // Optional field
    });

    it('should handle mixed DTO and explicit named params', async () => {
      await generate(inlineConfigPath);

      const spec: OpenApiSpec = JSON.parse(
        readFileSync(inlineOutputPath, 'utf-8'),
      );

      const params = spec.paths['/items/combined'].get?.parameters ?? [];
      const paramNames = params.map((p) => p.name);

      // Should have params from CombinedQueryDto
      expect(paramNames).toContain('search');
      expect(paramNames).toContain('page');
      expect(paramNames).toContain('limit');
      expect(paramNames).toContain('includeDeleted');

      // Should also have the explicit 'format' param
      expect(paramNames).toContain('format');

      // Total should be 5 params
      expect(params).toHaveLength(5);
    });

    it('should NOT inline explicitly named params with DTO type', async () => {
      await generate(inlineConfigPath);

      const spec: OpenApiSpec = JSON.parse(
        readFileSync(inlineOutputPath, 'utf-8'),
      );

      const params = spec.paths['/items/named'].get?.parameters ?? [];
      const paramNames = params.map((p) => p.name);

      // Should have a single 'filter' parameter (not expanded)
      expect(paramNames).toContain('filter');
      expect(params).toHaveLength(1);

      // The filter param should reference FilterQueryDto schema
      const filterParam = params[0];
      expect(filterParam.schema?.$ref).toBe(
        '#/components/schemas/FilterQueryDto',
      );
    });

    it('should NOT affect primitive query params', async () => {
      await generate(inlineConfigPath);

      const spec: OpenApiSpec = JSON.parse(
        readFileSync(inlineOutputPath, 'utf-8'),
      );

      const params = spec.paths['/items/primitive'].get?.parameters ?? [];
      const paramNames = params.map((p) => p.name);

      // Should have individual primitive params as-is
      expect(paramNames).toContain('id');
      expect(paramNames).toContain('count');
      expect(paramNames).toContain('active');
      expect(params).toHaveLength(3);

      // Verify all are query params
      for (const param of params) {
        expect(param.in).toBe('query');
      }
    });
  });

  describe('query.style: "ref" (schema refs mode)', () => {
    it('should keep query DTOs as single schema ref parameters', async () => {
      await generate(schemaRefsConfigPath);

      const spec: OpenApiSpec = JSON.parse(
        readFileSync(schemaRefsOutputPath, 'utf-8'),
      );

      const params = spec.paths['/items'].get?.parameters ?? [];
      const paramNames = params.map((p) => p.name);

      // Should have a single '_pagination' parameter (not expanded)
      expect(paramNames).toContain('_pagination');
      expect(params).toHaveLength(1);

      // Should reference schema
      const paginationParam = params[0];
      expect(paginationParam.schema?.$ref).toBe(
        '#/components/schemas/PaginationQueryDto',
      );
    });

    it('should still NOT expand explicitly named params', async () => {
      await generate(schemaRefsConfigPath);

      const spec: OpenApiSpec = JSON.parse(
        readFileSync(schemaRefsOutputPath, 'utf-8'),
      );

      const params = spec.paths['/items/named'].get?.parameters ?? [];

      // Should still be a single 'filter' param
      expect(params).toHaveLength(1);
      expect(params[0].name).toBe('filter');
      expect(params[0].schema?.$ref).toBe(
        '#/components/schemas/FilterQueryDto',
      );
    });

    it('should still handle primitive params correctly', async () => {
      await generate(schemaRefsConfigPath);

      const spec: OpenApiSpec = JSON.parse(
        readFileSync(schemaRefsOutputPath, 'utf-8'),
      );

      const params = spec.paths['/items/primitive'].get?.parameters ?? [];
      const paramNames = params.map((p) => p.name);

      // Primitive params should be unchanged
      expect(paramNames).toEqual(['id', 'count', 'active']);
      expect(params).toHaveLength(3);
    });
  });
});
