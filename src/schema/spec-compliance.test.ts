import { describe, it, expect } from 'vitest';
import {
  adaptExamplesForVersion,
  sanitizeComponentName,
  sanitizeComponentNames,
} from './spec-compliance.js';
import type { OpenApiPaths, OpenApiSchema } from '../config/types.js';

describe('sanitizeComponentName', () => {
  it('turns generic instantiations into valid component names', () => {
    expect(sanitizeComponentName('Page<User>')).toBe('Page_User');
    expect(sanitizeComponentName('Page<User[]>')).toBe('Page_UserArray');
    expect(sanitizeComponentName('Result<A | B, C>')).toBe('Result_A_Or_B_C');
    expect(sanitizeComponentName('Valid_Name-1.0')).toBe('Valid_Name-1.0');
  });
});

describe('sanitizeComponentNames', () => {
  it('renames components and every reference to them', () => {
    const paths = {
      '/pages': {
        get: {
          responses: {
            '200': {
              description: '',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Page<User>' },
                },
              },
            },
          },
        },
      },
    } as unknown as OpenApiPaths;
    const schemas: Record<string, OpenApiSchema> = {
      'Page<User>': {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/User' },
          },
        },
      },
      User: { type: 'object' },
      // Already taken by a real schema: the sanitized name gets a suffix
      Page_User: { type: 'string' },
    };

    const result = sanitizeComponentNames(paths, schemas);

    expect(Object.keys(result.schemas).sort()).toEqual([
      'Page_User',
      'Page_User_2',
      'User',
    ]);
    expect(
      (result.paths['/pages'] as Record<string, any>).get.responses['200']
        .content['application/json'].schema,
    ).toEqual({ $ref: '#/components/schemas/Page_User_2' });
  });
});

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
