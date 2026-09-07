import { describe, it, expect, afterEach } from 'vitest';
import { resolve } from 'path';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { generate } from '../src/generate.js';
import type { OpenApiSpec } from '../src/types.js';

describe('@ApiProperty extraction E2E', () => {
  const configPath = resolve(
    process.cwd(),
    'e2e-applications/api-property-enum/openapi.config.ts',
  );
  const outputPath = resolve(
    process.cwd(),
    'e2e-applications/api-property-enum/openapi.generated.json',
  );

  let spec: OpenApiSpec;

  afterEach(() => {
    if (existsSync(outputPath)) {
      unlinkSync(outputPath);
    }
  });

  /** Helper: generate once and return schemas */
  const getSchemas = async () => {
    await generate(configPath);
    spec = JSON.parse(readFileSync(outputPath, 'utf-8'));
    return spec.components?.schemas ?? {};
  };

  /** Helper: get a property from ItemDto */
  const itemProp = async (name: string) => {
    const schemas = await getSchemas();
    return schemas['ItemDto']?.properties?.[name] as
      | Record<string, unknown>
      | undefined;
  };

  it('should generate the spec successfully', async () => {
    const result = await generate(configPath);
    expect(result.outputPath).toBe(outputPath);
    expect(existsSync(outputPath)).toBe(true);

    spec = JSON.parse(readFileSync(outputPath, 'utf-8'));
    expect(spec.openapi).toBe('3.0.3');
    expect(spec.paths['/items']).toBeDefined();
    expect(spec.paths['/tasks']).toBeDefined();
  });

  // ── enum ──────────────────────────────────────────────

  describe('enum', () => {
    it('should extract string enum from TS enum ref', async () => {
      const color = await itemProp('color');
      expect(color).toEqual({ $ref: '#/components/schemas/Color' });
    });

    it('should extract inline string enum array', async () => {
      const status = await itemProp('status');
      expect(status!.enum).toEqual(['active', 'deprecated', 'archived']);
    });

    it('should extract numeric enum', async () => {
      const schemas = await getSchemas();
      const priority = schemas['TaskDto']?.properties?.['priority'] as Record<
        string,
        unknown
      >;
      expect(priority.enum).toEqual([0, 1, 2, 3, 4]);
    });

    it('should extract enum from @ApiPropertyOptional', async () => {
      const schemas = await getSchemas();
      const estimate = schemas['TaskDto']?.properties?.['estimate'] as Record<
        string,
        unknown
      >;
      expect(estimate).toEqual({ $ref: '#/components/schemas/Size' });
    });

    it('should produce array type with enum items for isArray', async () => {
      const schemas = await getSchemas();
      const sizes = schemas['SearchDto']?.properties?.['sizes'] as Record<
        string,
        unknown
      >;
      expect(sizes.type).toBe('array');
      expect((sizes.items as Record<string, unknown>).$ref).toBe(
        '#/components/schemas/Size',
      );
    });

    it('should ref the enum declaration for a single-member enum query param', async () => {
      // A single-member enum collapses to its member literal in the type
      // system; the ref must still point at the enum, and the schema must exist
      await getSchemas();
      const params = spec.paths['/tasks/filter'].get.parameters ?? [];
      const channel = params.find((p) => p.name === 'channel');

      expect(channel?.schema).toEqual({
        $ref: '#/components/schemas/Channel',
      });
      expect(spec.components?.schemas?.['Channel']).toBeDefined();
      expect(spec.components?.schemas?.['Email']).toBeUndefined();
    });

    it('should ref the enum declaration for a multi-member enum query param', async () => {
      await getSchemas();
      const params = spec.paths['/tasks/filter'].get.parameters ?? [];
      const color = params.find((p) => p.name === 'color');

      expect(color?.schema).toEqual({ $ref: '#/components/schemas/Color' });
    });

    it('should ref a single-member enum from DTO properties', async () => {
      const schemas = await getSchemas();
      const props = schemas['SearchDto']?.properties ?? {};

      expect(props['channel']).toEqual({
        $ref: '#/components/schemas/Channel',
      });
      expect(props['fallbackChannel']).toEqual({
        $ref: '#/components/schemas/Channel',
      });
    });

    it('should extract two-value inline enum', async () => {
      const schemas = await getSchemas();
      const sortOrder = schemas['SearchDto']?.properties?.[
        'sortOrder'
      ] as Record<string, unknown>;
      expect(sortOrder.enum).toEqual(['asc', 'desc']);
    });
  });

  // ── description ───────────────────────────────────────

  describe('description', () => {
    it('should extract description from @ApiProperty', async () => {
      const name = await itemProp('name');
      expect(name!.description).toBe('Display name of the item');
    });
  });

  // ── format ────────────────────────────────────────────

  describe('format', () => {
    it('should extract format from @ApiProperty', async () => {
      const email = await itemProp('email');
      expect(email!.format).toBe('email');
    });
  });

  // ── numeric constraints ───────────────────────────────

  describe('numeric constraints', () => {
    it('should extract minimum and maximum', async () => {
      const price = await itemProp('price');
      expect(price!.minimum).toBe(0);
      expect(price!.maximum).toBe(10000);
    });

    it('should extract multipleOf', async () => {
      const weight = await itemProp('weight');
      expect(weight!.multipleOf).toBe(0.01);
    });
  });

  // ── string constraints ────────────────────────────────

  describe('string constraints', () => {
    it('should extract minLength and maxLength', async () => {
      const slug = await itemProp('slug');
      expect(slug!.minLength).toBe(3);
      expect(slug!.maxLength).toBe(50);
    });

    it('should extract pattern', async () => {
      const sku = await itemProp('sku');
      expect(sku!.pattern).toBe('^[A-Z]{2}-\\d+$');
    });
  });

  // ── array constraints ─────────────────────────────────

  describe('array constraints', () => {
    it('should extract minItems and maxItems', async () => {
      const variants = await itemProp('variants');
      expect(variants!.minItems).toBe(1);
      expect(variants!.maxItems).toBe(5);
    });

    it('should extract uniqueItems', async () => {
      const codes = await itemProp('codes');
      expect(codes!.uniqueItems).toBe(true);
    });
  });

  // ── example & default ─────────────────────────────────

  describe('example and default', () => {
    it('should extract example from @ApiProperty', async () => {
      const currency = await itemProp('currency');
      expect(currency!.example).toBe('USD');
    });

    it('should extract default from @ApiProperty', async () => {
      const currency = await itemProp('currency');
      expect(currency!.default).toBe('USD');
    });
  });

  // ── deprecated ────────────────────────────────────────

  describe('deprecated', () => {
    it('should mark property as deprecated', async () => {
      const legacy = await itemProp('legacyCode');
      expect(legacy!.deprecated).toBe(true);
    });
  });

  // ── readOnly / writeOnly ──────────────────────────────

  describe('readOnly and writeOnly', () => {
    it('should extract readOnly', async () => {
      const id = await itemProp('id');
      expect(id!.readOnly).toBe(true);
    });

    it('should extract writeOnly', async () => {
      const pw = await itemProp('password');
      expect(pw!.writeOnly).toBe(true);
    });
  });

  // ── nullable ──────────────────────────────────────────

  describe('nullable', () => {
    it('should mark property as nullable from @ApiProperty', async () => {
      const notes = await itemProp('notes');
      expect(notes!.nullable).toBe(true);
    });
  });

  // ── title ─────────────────────────────────────────────

  describe('title', () => {
    it('should extract title from @ApiProperty', async () => {
      const tags = await itemProp('tags');
      expect(tags!.title).toBe('Tag List');
    });
  });

  // ── @ApiHideProperty ──────────────────────────────────

  describe('@ApiHideProperty', () => {
    it('should exclude properties decorated with @ApiHideProperty', async () => {
      const schemas = await getSchemas();
      const props = Object.keys(schemas['ItemDto']?.properties ?? {});
      expect(props).not.toContain('internalSecret');
    });
  });
});
