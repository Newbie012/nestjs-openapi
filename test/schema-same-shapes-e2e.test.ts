import { describe, it, expect, afterAll } from 'vitest';
import { resolve } from 'path';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { generate } from '../src/document/generate.js';
import type { OpenApiSpec } from '../src/config/types.js';

/**
 * Same-name declarations whose schemas are equal are one schema. Fixture:
 * - /same/* reaches only equal ones: a MoneyDto class and interface with
 *   fields in another order, two StatusDto enums with the same values, two
 *   identical ChoiceDto<T> generics, identical recursive BranchDto/LeafDto,
 *   and one enumName given equal values twice;
 * - /differ/* reaches ones that differ: RowDto (and SectionDto over it),
 *   NoteDto by its description, ResultDto<string> while ResultDto<number>
 *   exists once, ItemDto behind an alias of an array, and one enumName given
 *   different values.
 */
describe('Same-shape schema names E2E', () => {
  const fixtureDir = resolve(
    process.cwd(),
    'e2e-applications/schema-same-shapes',
  );
  const variants = ['same', 'inline', 'rename', 'error'] as const;
  type Variant = (typeof variants)[number];

  const run = async (variant: Variant) => {
    const result = await generate(
      resolve(fixtureDir, `openapi.${variant}.config.ts`),
    );
    const spec: OpenApiSpec = JSON.parse(
      readFileSync(
        resolve(fixtureDir, `openapi.${variant}.generated.json`),
        'utf-8',
      ),
    );
    return { result, spec };
  };

  afterAll(() => {
    for (const variant of variants) {
      const outputPath = resolve(
        fixtureDir,
        `openapi.${variant}.generated.json`,
      );
      if (existsSync(outputPath)) unlinkSync(outputPath);
    }
  });

  const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

  describe('equal schemas', () => {
    it('share one component under their own name, even in error mode', async () => {
      const { result, spec } = await run('same');
      const schemas = spec.components?.schemas ?? {};

      expect(result.validation.brokenRefs).toEqual([]);
      expect(Object.keys(schemas).sort()).toEqual([
        'BranchDto',
        'ChoiceDto_TagDto',
        'ChoiceDto_string',
        'ForestDto',
        'GroveDto',
        'InvoiceDto',
        'LeafDto',
        'MoneyDto',
        'PaymentMethodDto',
        'RefundDto',
        'StatusDto',
        'TagDto',
        'TagFiltersDto',
      ]);
      expect(schemas['InvoiceDto']?.properties?.['total']).toEqual(
        ref('MoneyDto'),
      );
      expect(schemas['RefundDto']?.properties?.['amount']).toEqual(
        ref('MoneyDto'),
      );
      expect(schemas['RefundDto']?.properties?.['status']).toEqual(
        ref('StatusDto'),
      );
      expect(schemas['TagFiltersDto']?.properties?.['names']).toEqual({
        type: 'array',
        items: ref('ChoiceDto_string'),
      });
      expect(schemas['GroveDto']?.properties?.['root']).toEqual(
        ref('BranchDto'),
      );
    });

    it('keep the first declaration by file path', async () => {
      const { spec } = await run('same');

      // billing's class lists amount first, refunds' interface currency
      expect(spec.components?.schemas?.['MoneyDto']?.required).toEqual([
        'amount',
        'currency',
      ]);
    });
  });

  describe('different schemas', () => {
    it("'rename' names only the ones that differ after their file", async () => {
      const { result, spec } = await run('rename');
      const schemas = spec.components?.schemas ?? {};

      expect(result.validation.brokenRefs).toEqual([]);
      expect(Object.keys(schemas)).toEqual(
        expect.arrayContaining([
          'AReport_RowDto',
          'BReport_RowDto',
          'AReport_SectionDto',
          'BReport_SectionDto',
          'ANote_NoteDto',
          'BNote_NoteDto',
          'AReport_ResultDto_string',
          'BReport_ResultDto_string',
          'ResultDto_number',
          'Item_ItemDto',
          'Shelf_ItemDto',
          'MoneyDto',
          'ChoiceDto_string',
        ]),
      );
      expect(schemas['DailyReportDto']?.properties).toEqual({
        section: ref('AReport_SectionDto'),
        summary: ref('AReport_ResultDto_string'),
        count: ref('ResultDto_number'),
      });
    });

    it('point an alias of an array at the declaration it names', async () => {
      const { spec } = await run('rename');
      const schemas = spec.components?.schemas ?? {};

      expect(schemas['ItemListDto']).toEqual({
        type: 'array',
        items: ref('Item_ItemDto'),
      });
      expect(schemas['Item_ItemDto']?.required).toEqual(['sku']);
    });

    it("'inline' writes only the ones that differ in place", async () => {
      const { result, spec } = await run('inline');
      const schemas = spec.components?.schemas ?? {};

      expect(result.validation.brokenRefs).toEqual([]);
      expect(Object.keys(schemas)).not.toEqual(
        expect.arrayContaining(['RowDto']),
      );
      expect(schemas['WeeklyReportDto']?.properties?.['summary']).toEqual({
        type: 'object',
        properties: { data: { type: 'string' }, error: { type: 'string' } },
        required: ['data'],
      });
      expect(schemas['ItemListDto']).toEqual({
        type: 'array',
        items: {
          type: 'object',
          properties: { sku: { type: 'string' } },
          required: ['sku'],
        },
      });
      expect(schemas['InvoiceDto']?.properties?.['total']).toEqual(
        ref('MoneyDto'),
      );
    });

    it('write an enumName given different values in place', async () => {
      const { spec } = await run('rename');
      const schemas = spec.components?.schemas ?? {};

      expect(schemas['PriorityDto']).toBeUndefined();
      expect(schemas['TaskDto']?.properties?.['priority']).toEqual({
        type: 'string',
        enum: ['low', 'high'],
      });
      expect(schemas['CommentDto']?.properties?.['priority']).toEqual({
        type: 'string',
        enum: ['low', 'medium', 'high'],
      });
    });

    it("'error' fails, saying how each differs", async () => {
      await expect(
        generate(resolve(fixtureDir, 'openapi.error.config.ts')),
      ).rejects.toThrow(
        [
          'Different schemas share a name:',
          '  ItemDto: src/inventory/item.dto.ts, src/inventory/shelf.dto.ts',
          '    differ at properties.shelf, properties.sku, required[0]',
          '  NoteDto: src/notes/a/note.dto.ts, src/notes/b/note.dto.ts',
          '    differ at properties.text.description',
          '  ResultDto<string>: src/reports/a/report.dto.ts, src/reports/b/report.dto.ts',
          '    differ at properties.error',
          '  RowDto: src/reports/a/report.dto.ts, src/reports/b/report.dto.ts',
          '    differ at properties.total, required',
          '  SectionDto: src/reports/a/report.dto.ts, src/reports/b/report.dto.ts',
          '    differ at properties.rows.items (RowDto differs)',
          '  PriorityDto (enumName): "low", "high" | "low", "medium", "high"',
        ].join('\n'),
      );
    });
  });
});
