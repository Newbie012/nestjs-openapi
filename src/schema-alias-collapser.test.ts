import { describe, it, expect } from 'vitest';
import { collapseAliasRefs } from './schema-alias-collapser.js';
import type { OpenApiPaths, OpenApiSchema } from './types.js';

describe('schema-alias-collapser', () => {
  const createPaths = (schemaRef: string): OpenApiPaths => ({
    '/items': {
      get: {
        operationId: 'listItems',
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { $ref: schemaRef },
              },
            },
          },
        },
      },
    },
  });

  it('should collapse alias chains and remove alias schemas', () => {
    const schemas: Record<string, OpenApiSchema> = {
      'AliasA': {
        $ref: '#/components/schemas/AliasB',
      },
      'AliasB': {
        $ref: '#/components/schemas/User',
        description: 'Wrapper alias',
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
    };

    const result = collapseAliasRefs(
      createPaths('#/components/schemas/AliasA'),
      schemas,
    );

    expect(
      result.paths['/items'].get.responses['200'].content?.['application/json']
        .schema,
    ).toEqual({ $ref: '#/components/schemas/User' });
    expect(result.schemas['AliasA']).toBeUndefined();
    expect(result.schemas['AliasB']).toBeUndefined();
    expect(result.schemas['User']).toBeDefined();
  });

  it('should preserve schemas with semantic fields beyond alias metadata', () => {
    const schemas: Record<string, OpenApiSchema> = {
      Wrapper: {
        $ref: '#/components/schemas/User',
        nullable: true,
      },
      User: {
        type: 'object',
      },
    };

    const result = collapseAliasRefs(
      createPaths('#/components/schemas/Wrapper'),
      schemas,
    );

    expect(
      result.paths['/items'].get.responses['200'].content?.['application/json']
        .schema,
    ).toEqual({ $ref: '#/components/schemas/Wrapper' });
    expect(result.schemas['Wrapper']).toBeDefined();
  });

  it('should preserve alias cycles', () => {
    const schemas: Record<string, OpenApiSchema> = {
      A: { $ref: '#/components/schemas/B' },
      B: { $ref: '#/components/schemas/A' },
      User: { type: 'object' },
    };

    const result = collapseAliasRefs(createPaths('#/components/schemas/A'), schemas);

    expect(
      result.paths['/items'].get.responses['200'].content?.['application/json']
        .schema,
    ).toEqual({ $ref: '#/components/schemas/A' });
    expect(result.schemas['A']).toBeDefined();
    expect(result.schemas['B']).toBeDefined();
  });

  it('should not rewrite literal $ref fields in schema data values', () => {
    const schemas: Record<string, OpenApiSchema> = {
      Alias: { $ref: '#/components/schemas/User' },
      Container: {
        type: 'object',
        properties: {
          payload: {
            type: 'object',
            default: {
              $ref: '#/components/schemas/Alias',
            },
          },
        },
      },
      User: { type: 'object' },
    };

    const result = collapseAliasRefs(
      createPaths('#/components/schemas/Alias'),
      schemas,
    );

    expect(
      result.paths['/items'].get.responses['200'].content?.['application/json']
        .schema,
    ).toEqual({ $ref: '#/components/schemas/User' });
    expect(
      (result.schemas['Container'].properties?.payload?.default as { $ref: string })
        .$ref,
    ).toBe('#/components/schemas/Alias');
  });
});
