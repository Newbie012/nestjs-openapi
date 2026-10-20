import { describe, expect, it } from 'vitest';
import {
  mapOperationSchemas,
  mapSchemaRefs,
  mapSubschemas,
} from './schema-walk.js';

describe('mapSubschemas', () => {
  it('visits every direct subschema once', () => {
    const visits: unknown[] = [];
    const schema = {
      items: { id: 'items' },
      not: { id: 'not' },
      additionalProperties: { id: 'additional' },
      allOf: [{ id: 'allOf0' }, { id: 'allOf1' }],
      anyOf: [{ id: 'anyOf0' }],
      oneOf: [{ id: 'oneOf0' }],
      prefixItems: [{ id: 'prefix0' }],
      properties: { a: { id: 'propA' }, b: { id: 'propB' } },
      patternProperties: { '^x': { id: 'pattern' } },
    };

    mapSubschemas(schema, (sub) => {
      visits.push(sub);
      return sub;
    });

    expect(visits).toEqual([
      { id: 'items' },
      { id: 'not' },
      { id: 'additional' },
      { id: 'allOf0' },
      { id: 'allOf1' },
      { id: 'anyOf0' },
      { id: 'oneOf0' },
      { id: 'prefix0' },
      { id: 'propA' },
      { id: 'propB' },
      { id: 'pattern' },
    ]);
  });

  it('visits the members of a draft-07 tuple and its rest element', () => {
    const visits: unknown[] = [];

    mapSubschemas(
      {
        items: [{ id: 'first' }, { id: 'second' }],
        additionalItems: { id: 'rest' },
      },
      (sub) => {
        visits.push(sub);
        return sub;
      },
    );

    expect(visits).toEqual([{ id: 'rest' }, { id: 'first' }, { id: 'second' }]);
  });

  it('replaces each subschema with what f returns', () => {
    const result = mapSubschemas(
      { type: 'object', properties: { a: { type: 'string' } } },
      () => ({ replaced: true }),
    );

    expect(result).toEqual({
      type: 'object',
      properties: { a: { replaced: true } },
    });
  });

  it('returns boolean additionalProperties and non-object values unchanged', () => {
    const f = () => {
      throw new Error('not expected');
    };
    const schema = { type: 'object', additionalProperties: false };

    expect(mapSubschemas(schema, f)).toEqual(schema);
    expect(mapSubschemas('text', f)).toBe('text');
    expect(mapSubschemas(null, f)).toBeNull();
    expect(mapSubschemas([1], f)).toEqual([1]);
  });
});

describe('mapSchemaRefs', () => {
  const rewrite = (ref: string) => ref.replace('Old', 'New');
  const ref = { $ref: '#/components/schemas/Old' };
  const rewritten = { $ref: '#/components/schemas/New' };

  it('rewrites refs under every subschema key', () => {
    const schema = {
      items: ref,
      not: ref,
      additionalProperties: ref,
      allOf: [ref],
      anyOf: [ref],
      oneOf: [ref],
      prefixItems: [ref],
      properties: { a: ref },
      patternProperties: { '^x': ref },
    };

    expect(mapSchemaRefs(schema, rewrite)).toEqual({
      items: rewritten,
      not: rewritten,
      additionalProperties: rewritten,
      allOf: [rewritten],
      anyOf: [rewritten],
      oneOf: [rewritten],
      prefixItems: [rewritten],
      properties: { a: rewritten },
      patternProperties: { '^x': rewritten },
    });
  });

  it('rewrites refs nested several levels deep', () => {
    expect(
      mapSchemaRefs({ items: { not: { allOf: [ref] } } }, rewrite),
    ).toEqual({ items: { not: { allOf: [rewritten] } } });
  });

  it('rewrites discriminator mapping values', () => {
    const schema = {
      oneOf: [ref],
      discriminator: {
        propertyName: 'kind',
        mapping: { a: '#/components/schemas/Old' },
      },
    };

    expect(mapSchemaRefs(schema, rewrite)).toEqual({
      oneOf: [rewritten],
      discriminator: {
        propertyName: 'kind',
        mapping: { a: '#/components/schemas/New' },
      },
    });
  });
});

describe('mapOperationSchemas', () => {
  const operation = {
    parameters: [{ name: 'q', in: 'query', schema: { id: 'param' } }],
    requestBody: { content: { 'text/plain': { schema: { id: 'request' } } } },
    responses: {
      '200': {
        description: 'ok',
        content: { 'application/json': { schema: { id: 'response' } } },
        headers: { 'X-Rate': { schema: { id: 'header' } } },
      },
    },
  };

  it('visits every schema an operation holds, including query and additionalOperations', () => {
    const visits: unknown[] = [];
    const paths = {
      '/a': {
        summary: 'untouched',
        query: operation,
        additionalOperations: { COPY: operation },
      },
    };

    const result = mapOperationSchemas(paths, (schema, contentType) => {
      visits.push([schema, contentType]);
      return { visited: schema };
    });

    const ids = [
      [{ id: 'param' }, undefined],
      [{ id: 'request' }, 'text/plain'],
      [{ id: 'response' }, 'application/json'],
      [{ id: 'header' }, undefined],
    ];
    expect(visits).toEqual([...ids, ...ids]);
    expect(result['/a'].summary).toBe('untouched');
    expect(
      result['/a'].additionalOperations.COPY.responses['200'].headers['X-Rate'],
    ).toEqual({ schema: { visited: { id: 'header' } } });
  });

  it('leaves path-level fields and unknown keys as they are', () => {
    const paths = {
      '/a': { summary: 's', parameters: [{ schema: { id: 'path' } }] },
    };

    expect(mapOperationSchemas(paths, () => 'changed')).toEqual(paths);
  });
});
