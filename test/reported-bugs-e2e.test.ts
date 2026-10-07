import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'path';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { generate } from '../src/document/generate.js';
import type { OpenApiSpec } from '../src/config/types.js';

describe('Reported bugs E2E', () => {
  const configPath = resolve(
    process.cwd(),
    'e2e-applications/reported-bugs/openapi.config.ts',
  );
  const outputPath = resolve(
    process.cwd(),
    'e2e-applications/reported-bugs/openapi.generated.json',
  );

  let result: Awaited<ReturnType<typeof generate>>;
  let spec: OpenApiSpec;

  beforeAll(async () => {
    result = await generate(configPath);
    spec = JSON.parse(readFileSync(outputPath, 'utf-8'));
  });

  afterAll(() => {
    if (existsSync(outputPath)) {
      unlinkSync(outputPath);
    }
  });

  const schemaOf = (name: string) => spec.components?.schemas?.[name];

  describe('same-named classes in different files', () => {
    it('uses the class the controller imports', () => {
      // src/a/foo.dto.ts is imported; src/b/foo.dto.ts also matches dtoGlob
      expect(Object.keys(schemaOf('FooDto')?.properties ?? {})).toEqual(['a']);
    });
  });

  describe('optional properties declared through decorators', () => {
    it('leaves @ApiProperty({ required: false }) out of required', () => {
      expect(schemaOf('ArticleDto')?.required).not.toContain('summary');
    });

    it('leaves @ApiPropertyOptional() out of required', () => {
      expect(schemaOf('ArticleDto')?.required).not.toContain('details');
    });

    it('keeps @ApiProperty() in required', () => {
      expect(schemaOf('ArticleDto')?.required).toContain('id');
    });
  });

  describe('types declared outside dtoGlob', () => {
    it('generates a schema for an exported abstract class', () => {
      expect(result.validation.brokenRefs).toEqual([]);
      expect(schemaOf('BaseCursorResponse')).toBeDefined();
    });

    it('keeps a DTO field typed with a type alias', () => {
      expect(schemaOf('ListRequestDto')?.properties?.sortBy).toEqual({
        $ref: '#/components/schemas/SortByType',
      });
      expect(schemaOf('SortByType')).toBeDefined();
    });

    it('keeps fields inherited from a base class', () => {
      expect(
        Object.keys(schemaOf('ExtendedCursorDto')?.properties ?? {}).sort(),
      ).toEqual(['cursor', 'extra', 'sortBy']);
    });
  });
});

describe('Reported bugs E2E: schema generator error in a DTO file', () => {
  const configPath = resolve(
    process.cwd(),
    'e2e-applications/reported-bugs-schema-error/openapi.config.ts',
  );
  const outputPath = resolve(
    process.cwd(),
    'e2e-applications/reported-bugs-schema-error/openapi.generated.json',
  );

  let result: Awaited<ReturnType<typeof generate>>;
  let spec: OpenApiSpec;

  beforeAll(async () => {
    result = await generate(configPath);
    spec = JSON.parse(readFileSync(outputPath, 'utf-8'));
  });

  afterAll(() => {
    if (existsSync(outputPath)) {
      unlinkSync(outputPath);
    }
  });

  it('still generates the DTOs of a file that has an unrelated typed const', () => {
    expect(result.validation.brokenRefs).toEqual([]);
    expect(spec.components?.schemas?.['StateDto']?.properties).toEqual({
      installed: { type: 'number' },
    });
  });
});
