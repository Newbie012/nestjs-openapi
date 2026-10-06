import { describe, it, expect } from 'vitest';
import { adaptExamplesForVersion } from './spec-compliance.js';
import type { OpenApiSchema } from './types.js';

describe('adaptExamplesForVersion', () => {
  const schemas: Record<string, OpenApiSchema> = {
    Dto: {
      type: 'object',
      properties: {
        list: {
          type: 'string',
          examples: ['a', 'b'],
        } as unknown as OpenApiSchema,
        map: {
          type: 'string',
          examples: { first: { value: 'x' }, second: { value: 'y' } },
        } as unknown as OpenApiSchema,
      },
    },
  };

  it('uses the first example in 3.0, which has no `examples` in schemas', () => {
    const result = adaptExamplesForVersion({}, schemas, '3.0.3');

    expect(result.schemas['Dto']?.properties).toEqual({
      list: { type: 'string', example: 'a' },
      map: { type: 'string', example: 'x' },
    });
  });

  it('writes `examples` as an array in 3.1', () => {
    const result = adaptExamplesForVersion({}, schemas, '3.1.0');

    expect(result.schemas['Dto']?.properties).toEqual({
      list: { type: 'string', examples: ['a', 'b'] },
      map: { type: 'string', examples: ['x', 'y'] },
    });
  });
});
