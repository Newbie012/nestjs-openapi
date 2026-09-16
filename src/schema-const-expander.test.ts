import { describe, it, expect } from 'vitest';
import {
  expandConstInSchema,
  expandConstSchemas,
} from './schema-const-expander.js';
import type { OpenApiSchema } from './types.js';

/** `const` is not on OpenApiSchema, so test inputs carry it as an extra key */
const withConst = (schema: Record<string, unknown>): OpenApiSchema =>
  schema as OpenApiSchema;

describe('expandConstInSchema', () => {
  it('should rewrite const as a single-value enum', () => {
    const result = expandConstInSchema(
      withConst({ const: 'email', type: 'string' }),
    );

    expect(result).toEqual({ enum: ['email'], type: 'string' });
    expect(result).not.toHaveProperty('const');
  });

  it('should keep every other keyword', () => {
    const result = expandConstInSchema(
      withConst({
        const: 'pod',
        type: 'string',
        description: 'The filter field',
      }),
    );

    expect(result).toEqual({
      enum: ['pod'],
      type: 'string',
      description: 'The filter field',
    });
  });

  it('should preserve an existing enum and drop const', () => {
    const result = expandConstInSchema(
      withConst({ const: 'a', enum: ['a', 'b'], type: 'string' }),
    );

    expect(result).toEqual({ enum: ['a', 'b'], type: 'string' });
  });

  it('should leave a schema without const untouched', () => {
    const schema: OpenApiSchema = { type: 'string', enum: ['a', 'b'] };

    expect(expandConstInSchema(schema)).toEqual(schema);
  });

  it.each([
    ['a falsy string', '', ['']],
    ['zero', 0, [0]],
    ['false', false, [false]],
    ['null', null, [null]],
  ])('should expand %s rather than treating it as absent', (_, value, want) => {
    const result = expandConstInSchema(withConst({ const: value }));

    expect(result).toEqual({ enum: want });
  });

  it('should expand const in properties', () => {
    const result = expandConstInSchema({
      type: 'object',
      properties: {
        code: withConst({ const: 'USER_HAS_TODOS', type: 'string' }),
        message: { type: 'string' },
      },
    });

    expect(result.properties).toEqual({
      code: { enum: ['USER_HAS_TODOS'], type: 'string' },
      message: { type: 'string' },
    });
  });

  it('should expand const in array items', () => {
    const result = expandConstInSchema({
      type: 'array',
      items: withConst({ const: 'only', type: 'string' }),
    });

    expect(result.items).toEqual({ enum: ['only'], type: 'string' });
  });

  it.each(['oneOf', 'anyOf', 'allOf'] as const)(
    'should expand const inside %s variants',
    (keyword) => {
      const result = expandConstInSchema({
        [keyword]: [
          withConst({ const: 'a', type: 'string' }),
          { type: 'number' },
        ],
      });

      expect(result[keyword]).toEqual([
        { enum: ['a'], type: 'string' },
        { type: 'number' },
      ]);
    },
  );

  it('should expand const in object-valued additionalProperties', () => {
    const result = expandConstInSchema({
      type: 'object',
      additionalProperties: withConst({ const: 'x', type: 'string' }),
    });

    expect(result.additionalProperties).toEqual({
      enum: ['x'],
      type: 'string',
    });
  });

  it('should preserve boolean additionalProperties', () => {
    const result = expandConstInSchema({
      type: 'object',
      additionalProperties: false,
      properties: { a: { type: 'string' } },
    });

    expect(result.additionalProperties).toBe(false);
  });

  it('should expand const nested several levels deep', () => {
    const result = expandConstInSchema({
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kind: withConst({ const: 'leaf', type: 'string' }),
            },
          },
        },
      },
    });

    expect(result.properties?.items?.items?.properties?.['kind']).toEqual({
      enum: ['leaf'],
      type: 'string',
    });
  });
});

describe('expandConstSchemas', () => {
  it('should expand const across every schema in the map', () => {
    const result = expandConstSchemas(
      {
        Channel: withConst({ const: 'email', type: 'string' }),
        Color: { type: 'string', enum: ['red', 'green'] },
      },
      '3.0.3',
    );

    expect(result).toEqual({
      Channel: { enum: ['email'], type: 'string' },
      Color: { type: 'string', enum: ['red', 'green'] },
    });
  });

  it('should return an empty map unchanged', () => {
    expect(expandConstSchemas({}, '3.0.3')).toEqual({});
  });

  it.each(['3.1.0', '3.2.0'] as const)(
    'should keep const as-is for %s',
    (version) => {
      const result = expandConstSchemas(
        { Widget: withConst({ const: 'card', type: 'string' }) },
        version,
      );

      expect(result['Widget']).toEqual({ const: 'card', type: 'string' });
    },
  );

  it.each(['3.0.3', '3.1.0', '3.2.0'] as const)(
    'should leave a multi-value enum untouched for %s',
    (version) => {
      const result = expandConstSchemas(
        { Widget: { type: 'string', enum: ['card', 'cash'] } },
        version,
      );

      expect(result['Widget']).toEqual({
        type: 'string',
        enum: ['card', 'cash'],
      });
      expect(result['Widget']).not.toHaveProperty('const');
    },
  );

  it('should expand const in nested properties for 3.0.3 only', () => {
    const schemas = {
      Widget: {
        type: 'object' as const,
        properties: { kind: withConst({ const: 'fixed', type: 'string' }) },
      },
    };

    expect(expandConstSchemas(schemas, '3.0.3')['Widget']?.properties).toEqual({
      kind: { enum: ['fixed'], type: 'string' },
    });
    expect(expandConstSchemas(schemas, '3.1.0')['Widget']?.properties).toEqual({
      kind: { const: 'fixed', type: 'string' },
    });
  });
});
