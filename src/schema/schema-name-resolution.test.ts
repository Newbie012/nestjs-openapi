import { describe, it, expect } from 'vitest';
import { Effect, Either } from 'effect';
import type {
  OpenApiSchema,
  SchemaNameCollision,
  SchemaNameCollisionStrategy,
} from '../config/types.js';
import type { SchemaNamePlan } from './schema-identity.js';
import {
  equalSchemaGroups,
  resolveSchemaNames,
  type EnumNameClash,
} from './schema-name-resolution.js';

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const object = (
  properties: Record<string, unknown>,
  required = Object.keys(properties),
) => ({ type: 'object', properties, required }) as OpenApiSchema;

// Shared names as planSchemaNames gives them: `<name>__oapiShared<n>`
const planFor = (
  declarations: readonly (readonly [temporary: string, file: string])[],
): SchemaNamePlan => {
  const entries = declarations.map(([temporary, file]) => {
    const name = temporary.replace(/__oapiShared\d+$/, '');
    return [
      temporary,
      {
        name,
        filePath: `/app/${file}`,
        relativePath: file,
        exported: true,
        kind: 'class',
        declarations: [],
      } satisfies SchemaNameCollision,
    ] as const;
  });
  return { declarations: new Map(), shared: new Map(entries) };
};

const resolve = (
  schemas: Record<string, OpenApiSchema>,
  plan: SchemaNamePlan,
  strategy: SchemaNameCollisionStrategy = 'error',
  enumNameClashes: readonly EnumNameClash[] = [],
) =>
  Effect.runSync(
    Effect.either(
      resolveSchemaNames(
        { '/x': { get: { responses: {} } } } as never,
        schemas,
        plan,
        strategy,
        enumNameClashes,
      ),
    ),
  );

const schemasOf = (result: ReturnType<typeof resolve>) => {
  if (Either.isLeft(result)) throw new Error(result.left.message);
  return result.right.schemas;
};

const messageOf = (result: ReturnType<typeof resolve>) =>
  Either.isLeft(result) ? result.left.message : undefined;

describe('equalSchemaGroups', () => {
  const groupsOf = (schemas: Record<string, OpenApiSchema>) =>
    equalSchemaGroups(schemas, (name) => name.replace(/\d+$/, ''));

  it('ignores key, required and enum order', () => {
    const groups = groupsOf({
      Money1: object({
        amount: { type: 'number' },
        currency: { type: 'string' },
      }),
      Money2: {
        required: ['currency', 'amount'],
        properties: {
          currency: { type: 'string' },
          amount: { type: 'number' },
        },
        type: 'object',
      },
      Status1: { type: 'string', enum: ['open', 'paid'] },
      Status2: { enum: ['paid', 'open'], type: 'string' },
    });

    expect(groups.get('Money1')).toBe(groups.get('Money2'));
    expect(groups.get('Status1')).toBe(groups.get('Status2'));
  });

  it('counts descriptions', () => {
    const groups = groupsOf({
      Note1: object({ text: { type: 'string', description: 'Plain text' } }),
      Note2: object({ text: { type: 'string', description: 'Markdown' } }),
    });

    expect(groups.get('Note1')).not.toBe(groups.get('Note2'));
  });

  it('tells apart parents whose children differ', () => {
    const groups = groupsOf({
      Section1: object({ rows: { type: 'array', items: ref('Row1') } }),
      Section2: object({ rows: { type: 'array', items: ref('Row2') } }),
      Row1: object({ id: { type: 'string' } }),
      Row2: object({ id: { type: 'string' }, total: { type: 'number' } }),
    });

    expect(groups.get('Section1')).not.toBe(groups.get('Section2'));
  });

  it('settles on recursive schemas', () => {
    const groups = groupsOf({
      Branch1: object({ leaves: { type: 'array', items: ref('Leaf1') } }),
      Leaf1: object({ branch: ref('Branch1') }, []),
      Branch2: object({ leaves: { type: 'array', items: ref('Leaf2') } }),
      Leaf2: object({ branch: ref('Branch2') }, []),
    });

    expect(groups.get('Branch1')).toBe(groups.get('Branch2'));
    expect(groups.get('Leaf1')).toBe(groups.get('Leaf2'));
  });

  it('tells apart references to differently named schemas of one shape', () => {
    const groups = groupsOf({
      Holder1: object({ value: ref('Cash') }),
      Holder2: object({ value: ref('Card') }),
      Cash: object({ amount: { type: 'number' } }),
      Card: object({ amount: { type: 'number' } }),
    });

    expect(groups.get('Holder1')).not.toBe(groups.get('Holder2'));
  });
});

describe('resolveSchemaNames', () => {
  const money = object({ amount: { type: 'number' } });

  it('gives equal declarations one component under their name, even in error mode', () => {
    const schemas = schemasOf(
      resolve(
        {
          MoneyDto__oapiShared0: money,
          MoneyDto__oapiShared1: money,
          InvoiceDto: object({ total: ref('MoneyDto__oapiShared0') }),
          RefundDto: object({ amount: ref('MoneyDto__oapiShared1') }),
        },
        planFor([
          ['MoneyDto__oapiShared0', 'billing.dto.ts'],
          ['MoneyDto__oapiShared1', 'refund.dto.ts'],
        ]),
      ),
    );

    expect(Object.keys(schemas).sort()).toEqual([
      'InvoiceDto',
      'MoneyDto',
      'RefundDto',
    ]);
    expect(schemas['InvoiceDto']?.properties?.['total']).toEqual(
      ref('MoneyDto'),
    );
    expect(schemas['RefundDto']?.properties?.['amount']).toEqual(
      ref('MoneyDto'),
    );
  });

  it('only splits the groups that differ', () => {
    const schemas = schemasOf(
      resolve(
        {
          MoneyDto__oapiShared0: money,
          MoneyDto__oapiShared1: money,
          MoneyDto__oapiShared2: object({ cents: { type: 'integer' } }),
        },
        planFor([
          ['MoneyDto__oapiShared0', 'billing.dto.ts'],
          ['MoneyDto__oapiShared1', 'refund.dto.ts'],
          ['MoneyDto__oapiShared2', 'wallet.dto.ts'],
        ]),
        'rename',
      ),
    );

    expect(Object.keys(schemas).sort()).toEqual([
      'Billing_MoneyDto',
      'Wallet_MoneyDto',
    ]);
  });

  it('fails in error mode, saying where the schemas differ', () => {
    const message = messageOf(
      resolve(
        {
          NoteDto__oapiShared0: object({
            text: { type: 'string', description: 'Plain text' },
          }),
          NoteDto__oapiShared1: object({
            text: { type: 'string', description: 'Markdown' },
          }),
        },
        planFor([
          ['NoteDto__oapiShared0', 'a/note.dto.ts'],
          ['NoteDto__oapiShared1', 'b/note.dto.ts'],
        ]),
      ),
    );

    expect(message).toContain(
      'NoteDto: a/note.dto.ts, b/note.dto.ts\n    differ at properties.text.description',
    );
  });

  it('names equal instantiations of a shared generic after the generic', () => {
    const option = object({
      label: { type: 'string' },
      value: { type: 'string' },
    });
    const schemas = schemasOf(
      resolve(
        {
          'ChoiceDto__oapiShared0<string>': option,
          'ChoiceDto__oapiShared1<string>': option,
          'ChoiceDto__oapiShared1<TagDto>': object({
            label: { type: 'string' },
            value: ref('TagDto'),
          }),
          TagDto: object({ slug: { type: 'string' } }),
        },
        planFor([
          ['ChoiceDto__oapiShared0', 'a/choices.dto.ts'],
          ['ChoiceDto__oapiShared1', 'b/choices.dto.ts'],
        ]),
      ),
    );

    expect(Object.keys(schemas).sort()).toEqual([
      'ChoiceDto<TagDto>',
      'ChoiceDto<string>',
      'TagDto',
    ]);
  });

  it('only splits the instantiation whose bodies differ', () => {
    const plan = planFor([
      ['ResultDto__oapiShared0', 'a/report.dto.ts'],
      ['ResultDto__oapiShared1', 'b/report.dto.ts'],
    ]);
    const schemas = {
      'ResultDto__oapiShared0<string>': object({ data: { type: 'string' } }),
      'ResultDto__oapiShared1<string>': object(
        { data: { type: 'string' }, error: { type: 'string' } },
        ['data'],
      ),
      'ResultDto__oapiShared0<number>': object({ data: { type: 'number' } }),
    };

    expect(
      Object.keys(schemasOf(resolve(schemas, plan, 'rename'))).sort(),
    ).toEqual([
      'AReport_ResultDto<string>',
      'BReport_ResultDto<string>',
      'ResultDto<number>',
    ]);
    expect(messageOf(resolve(schemas, plan))).toContain(
      'ResultDto<string>: a/report.dto.ts, b/report.dto.ts\n    differ at properties.error',
    );
  });

  it('inlines the differing schemas, and instantiations over them', () => {
    const result = resolve(
      {
        RowDto__oapiShared0: object({ id: { type: 'string' } }),
        RowDto__oapiShared1: object({ total: { type: 'number' } }),
        'PageDto<RowDto__oapiShared0>': object({
          items: { type: 'array', items: ref('RowDto__oapiShared0') },
        }),
      },
      planFor([
        ['RowDto__oapiShared0', 'a/report.dto.ts'],
        ['RowDto__oapiShared1', 'b/report.dto.ts'],
      ]),
      'inline',
    );

    expect(Either.isRight(result) && [...result.right.inline].sort()).toEqual([
      'AReport_RowDto',
      'BReport_RowDto',
      'PageDto<AReport_RowDto>',
    ]);
  });

  describe('naming function', () => {
    const plan = planFor([
      ['Shared__oapiShared0', 'a.dto.ts'],
      ['Shared__oapiShared1', 'b.dto.ts'],
    ]);
    const differing = {
      Shared__oapiShared0: object({ a: { type: 'string' } }),
      Shared__oapiShared1: object({ b: { type: 'string' } }),
      Other: object({ c: { type: 'string' } }),
    };

    it('is not called for equal declarations', () => {
      let calls = 0;
      resolve(
        { Shared__oapiShared0: money, Shared__oapiShared1: money },
        plan,
        () => `Name${calls++}`,
      );

      expect(calls).toBe(0);
    });

    it('fails when it returns the same name twice', () => {
      expect(messageOf(resolve(differing, plan, () => 'SameName'))).toMatch(
        /returned "SameName" for both Shared in a\.dto\.ts and Shared in b\.dto\.ts/,
      );
    });

    it("fails when it returns another schema's name", () => {
      expect(messageOf(resolve(differing, plan, () => 'Other'))).toMatch(
        /already the name of another schema/,
      );
    });

    it('accepts unique names', () => {
      const schemas = schemasOf(
        resolve(differing, plan, ({ relativePath }) =>
          relativePath.startsWith('a') ? 'SharedA' : 'SharedB',
        ),
      );

      expect(Object.keys(schemas).sort()).toEqual([
        'Other',
        'SharedA',
        'SharedB',
      ]);
    });
  });

  it('reports enumName clashes in error mode', () => {
    const message = messageOf(
      resolve({}, planFor([]), 'error', [
        {
          name: 'PriorityDto',
          values: [
            ['low', 'high'],
            ['low', 'medium', 'high'],
          ],
        },
      ]),
    );

    expect(message).toContain(
      'PriorityDto (enumName): "low", "high" | "low", "medium", "high"',
    );
  });
});
