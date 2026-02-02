import { describe, it, expect, afterEach } from 'vitest';
import { resolve } from 'path';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { generate } from '../src/generate.js';
import type { OpenApiSpec } from '../src/types.js';

/**
 * E2E tests to verify schema $ref formatting is correct.
 *
 * These tests ensure:
 * 1. Generic type refs like `PaginatedResponse<ArticleEntity>` are NOT URL-encoded
 * 2. Refs with angle brackets `<>` remain as-is in the JSON output
 */
describe('Schema Refs E2E', () => {
  const configPath = resolve(
    process.cwd(),
    'e2e-applications/complex-generics/openapi.config.ts',
  );
  const outputPath = resolve(
    process.cwd(),
    'e2e-applications/complex-generics/openapi.generated.json',
  );

  afterEach(() => {
    // Clean up generated file
    if (existsSync(outputPath)) {
      unlinkSync(outputPath);
    }
  });

  it('should generate OpenAPI spec with generic type refs', async () => {
    const result = await generate(configPath);

    expect(result.outputPath).toBe(outputPath);
    expect(existsSync(outputPath)).toBe(true);

    const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

    expect(spec.openapi).toBe('3.0.3');
    expect(spec.info.title).toBe('Complex Generics API');
  });

  it('should NOT URL-encode angle brackets in schema refs', async () => {
    await generate(configPath);

    // Read raw file content to check for URL encoding
    const rawContent = readFileSync(outputPath, 'utf-8');

    // These patterns should NOT appear (URL-encoded angle brackets)
    expect(rawContent).not.toContain('%3C'); // URL-encoded <
    expect(rawContent).not.toContain('%3E'); // URL-encoded >

    // These patterns SHOULD appear (clean generic refs)
    expect(rawContent).toContain('PaginatedResponse<');
    expect(rawContent).toContain('ApiResponseDto<');
    expect(rawContent).toContain('BatchResult<');
  });

  it('should have valid schema refs with generic types', async () => {
    await generate(configPath);

    const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

    // Check paths have refs with generic types
    const articlesGet = spec.paths['/articles']?.get;
    expect(
      articlesGet?.responses['200']?.content?.['application/json']?.schema,
    ).toEqual({
      $ref: '#/components/schemas/PaginatedResponse<ArticleEntity>',
    });

    const articlesPost = spec.paths['/articles']?.post;
    expect(
      articlesPost?.responses['201']?.content?.['application/json']?.schema,
    ).toEqual({
      $ref: '#/components/schemas/ApiResponseDto<ArticleEntity>',
    });
  });

  it('should include schemas for DTOs', async () => {
    await generate(configPath);

    const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));
    const schemas = spec.components?.schemas ?? {};
    const schemaNames = Object.keys(schemas);

    // Verify we have some schemas generated
    expect(schemaNames.length).toBeGreaterThan(0);

    // Verify base entity schemas exist
    expect(schemaNames).toContain('ArticleEntity');
    expect(schemaNames).toContain('UserEntity');
  });

  it('should have properly formatted $ref values without URL encoding', async () => {
    await generate(configPath);

    const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

    // Find all $ref values in paths and schemas
    const allRefs: string[] = [];
    const collectRefs = (obj: unknown): void => {
      if (obj && typeof obj === 'object') {
        const record = obj as Record<string, unknown>;
        if (typeof record.$ref === 'string') {
          allRefs.push(record.$ref);
        }
        for (const value of Object.values(record)) {
          collectRefs(value);
        }
      }
    };

    collectRefs(spec.paths);
    collectRefs(spec.components?.schemas ?? {});

    // Verify we collected some refs
    expect(allRefs.length).toBeGreaterThan(0);

    // Verify no refs are URL-encoded
    for (const ref of allRefs) {
      expect(ref).not.toContain('%3C');
      expect(ref).not.toContain('%3E');
      expect(ref).not.toContain('%7C'); // URL-encoded |
    }
  });

  it('should normalize structure refs to readable names', async () => {
    await generate(configPath);

    const rawContent = readFileSync(outputPath, 'utf-8');
    const spec: OpenApiSpec = JSON.parse(rawContent);
    const schemaNames = Object.keys(spec.components?.schemas ?? {});

    // Verify NO raw structure-XXX patterns in the output
    expect(rawContent).not.toMatch(/structure-\d+(-\d+)*/);

    // FilterRules should exist and have normalized refs
    expect(schemaNames).toContain('FilterRules');

    const filterRules = spec.components?.schemas?.['FilterRules'];
    expect(filterRules).toBeDefined();

    // Check that inline types have been normalized to readable names
    // namespaceLabels: SelectRule<{ key, value }> -> SelectRule<NamespaceLabels>
    // k8sLabels: SelectRule<{ name, value }> -> SelectRule<K8sLabels>
    // metadata: { version, timestamp } -> Metadata

    if (filterRules?.properties) {
      const props = filterRules.properties as Record<string, { $ref?: string }>;

      // namespaceLabels should reference SelectRule<NamespaceLabels> (not structure-XXX)
      if (props.namespaceLabels?.$ref) {
        expect(props.namespaceLabels.$ref).not.toContain('structure-');
        expect(props.namespaceLabels.$ref).toContain('NamespaceLabels');
      }

      // k8sLabels should reference SelectRule<K8sLabels> (not structure-XXX)
      if (props.k8sLabels?.$ref) {
        expect(props.k8sLabels.$ref).not.toContain('structure-');
        expect(props.k8sLabels.$ref).toContain('K8sLabels');
      }

      // metadata should reference Metadata directly (not structure-XXX)
      if (props.metadata?.$ref) {
        expect(props.metadata.$ref).not.toContain('structure-');
        expect(props.metadata.$ref).toContain('Metadata');
      }

      // Clean generics should remain unchanged
      if (props.tags?.$ref) {
        expect(props.tags.$ref).toBe('#/components/schemas/SelectRule<string>');
      }
    }

    // Verify the normalized schema names exist
    // These should be the property-key-based names
    const hasNamespaceLabels = schemaNames.some((n) =>
      n.includes('NamespaceLabels'),
    );
    const hasK8sLabels = schemaNames.some((n) => n.includes('K8sLabels'));

    expect(hasNamespaceLabels).toBe(true);
    expect(hasK8sLabels).toBe(true);
  });
});
