import { describe, it, expect } from 'vitest';
import {
  transformSchemasForVersion,
  transformSpecForVersion,
} from './schema-version-transformer.js';
import type { OpenApiSchema, OpenApiSpec } from './types.js';

describe('schema-version-transformer', () => {
  describe('transformSchemasForVersion', () => {
    it('should return schemas unchanged for 3.0.3', () => {
      const schemas: Record<string, OpenApiSchema> = {
        User: { type: 'object', properties: { name: { type: 'string' } } },
      };

      const result = transformSchemasForVersion(schemas, '3.0.3');

      expect(result).toEqual(schemas);
    });

    it('should transform nullable for 3.1.0', () => {
      const schemas: Record<string, OpenApiSchema> = {
        User: {
          type: 'object',
          properties: {
            name: { type: 'string', nullable: true },
            email: { type: 'string' },
          },
        },
      };

      const result = transformSchemasForVersion(schemas, '3.1.0');

      expect(result.User.properties?.name.type).toEqual(['string', 'null']);
      expect(result.User.properties?.email.type).toBe('string');
    });

    it('should transform nullable for 3.2.0', () => {
      const schemas: Record<string, OpenApiSchema> = {
        Product: {
          type: 'object',
          properties: {
            description: { type: 'string', nullable: true },
          },
        },
      };

      const result = transformSchemasForVersion(schemas, '3.2.0');

      expect(result.Product.properties?.description.type).toEqual([
        'string',
        'null',
      ]);
    });

    it('should transform nested nullable schemas in properties', () => {
      const schemas: Record<string, OpenApiSchema> = {
        User: {
          type: 'object',
          properties: {
            name: { type: 'string', nullable: true },
            age: { type: 'number' },
          },
        },
      };

      const result = transformSchemasForVersion(schemas, '3.1.0');

      expect(result.User.properties?.name.type).toEqual(['string', 'null']);
      expect(result.User.properties?.age.type).toBe('number');
    });

    it('should transform nullable in array items', () => {
      const schemas: Record<string, OpenApiSchema> = {
        UserList: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: { type: 'string', nullable: true },
            },
          },
        },
      };

      const result = transformSchemasForVersion(schemas, '3.1.0');

      expect(
        (result.UserList.properties?.items as OpenApiSchema).items?.type,
      ).toEqual(['string', 'null']);
    });

    it('should transform nullable in oneOf', () => {
      const schemas: Record<string, OpenApiSchema> = {
        Response: {
          oneOf: [{ type: 'string', nullable: true }, { type: 'number' }],
        },
      };

      const result = transformSchemasForVersion(schemas, '3.1.0');

      expect(result.Response.oneOf?.[0].type).toEqual(['string', 'null']);
      expect(result.Response.oneOf?.[1].type).toBe('number');
    });
  });

  describe('transformSpecForVersion', () => {
    it('should return spec unchanged for 3.0.3', () => {
      const spec: OpenApiSpec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {},
      };

      const result = transformSpecForVersion(spec, '3.0.3');

      expect(result.openapi).toBe('3.0.3');
    });

    it('should update version and transform schemas for 3.1.0', () => {
      const spec: OpenApiSpec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            User: {
              type: 'object',
              properties: {
                nickname: { type: 'string', nullable: true },
              },
            },
          },
        },
      };

      const result = transformSpecForVersion(spec, '3.1.0');

      expect(result.openapi).toBe('3.1.0');
      expect(
        result.components?.schemas?.User.properties?.nickname.type,
      ).toEqual(['string', 'null']);
    });

    it('should handle specs without schemas', () => {
      const spec: OpenApiSpec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {},
      };

      const result = transformSpecForVersion(spec, '3.1.0');

      expect(result.openapi).toBe('3.1.0');
      expect(result.components).toBeUndefined();
    });

    it('should transform nullable in path parameter schemas for 3.1.0', () => {
      const spec: OpenApiSpec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              parameters: [
                {
                  name: 'search',
                  in: 'query',
                  required: false,
                  schema: { type: 'string', nullable: true },
                },
              ],
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      };

      const result = transformSpecForVersion(spec, '3.1.0');

      const param = result.paths['/users'].get.parameters?.[0];
      expect(param?.schema?.type).toEqual(['string', 'null']);
    });

    it('should transform nullable in response schemas for 3.1.0', () => {
      const spec: OpenApiSpec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              responses: {
                '200': {
                  description: 'OK',
                  content: {
                    'application/json': {
                      schema: { type: 'number', nullable: true },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const result = transformSpecForVersion(spec, '3.1.0');

      const schema =
        result.paths['/users'].get.responses['200']?.content?.[
          'application/json'
      ]?.schema;
      expect(schema?.type).toEqual(['number', 'null']);
    });

    it('should preserve nullability for allOf-wrapped refs in path schemas', () => {
      const spec: OpenApiSpec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users/{id}': {
            get: {
              operationId: 'getUser',
              responses: {
                '200': {
                  description: 'OK',
                  content: {
                    'application/json': {
                      schema: {
                        allOf: [{ $ref: '#/components/schemas/UserDto' }],
                        nullable: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const result = transformSpecForVersion(spec, '3.1.0');

      const schema =
        result.paths['/users/{id}'].get.responses['200']?.content?.[
          'application/json'
        ]?.schema;

      expect(schema).toEqual({
        anyOf: [
          { allOf: [{ $ref: '#/components/schemas/UserDto' }] },
          { type: 'null' },
        ],
      });
    });

    it('should preserve nullability for oneOf path schemas', () => {
      const spec: OpenApiSpec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              parameters: [
                {
                  name: 'filter',
                  in: 'query',
                  required: false,
                  schema: {
                    oneOf: [{ type: 'string' }, { type: 'number' }],
                    nullable: true,
                  },
                },
              ],
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      };

      const result = transformSpecForVersion(spec, '3.1.0');

      const schema = result.paths['/users'].get.parameters?.[0]?.schema;
      expect(schema).toEqual({
        oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'null' }],
      });
    });

    it('should transform nullable in request body schemas for 3.1.0', () => {
      const spec: OpenApiSpec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        bio: { type: 'string', nullable: true },
                      },
                    },
                  },
                },
              },
              responses: { '201': { description: 'Created' } },
            },
          },
        },
      };

      const result = transformSpecForVersion(spec, '3.1.0');

      const schema =
        result.paths['/users'].post.requestBody?.content?.['application/json']
          ?.schema;
      expect(schema?.properties?.bio?.type).toEqual(['string', 'null']);
    });

    it('should leave path schemas untouched for 3.0.3', () => {
      const spec: OpenApiSpec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              parameters: [
                {
                  name: 'search',
                  in: 'query',
                  required: false,
                  schema: { type: 'string', nullable: true },
                },
              ],
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      };

      const result = transformSpecForVersion(spec, '3.0.3');

      const param = result.paths['/users'].get.parameters?.[0];
      expect(param?.schema).toEqual({ type: 'string', nullable: true });
    });

    it('should transform nullable number for 3.1.0', () => {
      const spec: OpenApiSpec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            Product: {
              type: 'object',
              properties: {
                price: { type: 'number', nullable: true },
              },
            },
          },
        },
      };

      const result = transformSpecForVersion(spec, '3.1.0');

      expect(
        result.components?.schemas?.Product.properties?.price.type,
      ).toEqual(['number', 'null']);
    });
  });
});
