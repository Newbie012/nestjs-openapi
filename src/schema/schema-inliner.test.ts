import { describe, it, expect } from 'vitest';
import { inlineSchemas } from './schema-inliner.js';
import type { OpenApiPaths, OpenApiSchema } from '../config/types.js';

describe('inlineSchemas', () => {
  const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

  it('replaces references with the schema, keeping sibling keywords', () => {
    const paths = {
      '/a': {
        get: {
          responses: {
            '200': {
              description: '',
              content: { 'application/json': { schema: ref('Outer') } },
            },
          },
        },
      },
    } as unknown as OpenApiPaths;
    const schemas: Record<string, OpenApiSchema> = {
      Outer: {
        type: 'object',
        properties: { inner: { allOf: [ref('Inner')], description: 'Inner' } },
      },
      Inner: { type: 'object', properties: { id: { type: 'string' } } },
    };

    const result = inlineSchemas(paths, schemas, new Set(['Inner']));

    expect(result.schemas).toEqual({
      Outer: {
        type: 'object',
        properties: {
          inner: {
            allOf: [{ type: 'object', properties: { id: { type: 'string' } } }],
            description: 'Inner',
          },
        },
      },
    });
    expect(result.kept).toEqual([]);
  });

  it('keeps a self-referencing schema as a component', () => {
    const schemas: Record<string, OpenApiSchema> = {
      Node: { type: 'object', properties: { next: ref('Node') } },
    };
    const paths = {
      '/nodes': {
        get: {
          responses: {
            '200': {
              description: '',
              content: { 'application/json': { schema: ref('Node') } },
            },
          },
        },
      },
    } as unknown as OpenApiPaths;

    const result = inlineSchemas(paths, schemas, new Set(['Node']));

    expect(result.kept).toEqual(['Node']);
    expect(result.schemas['Node']).toEqual(schemas['Node']);
  });
});
