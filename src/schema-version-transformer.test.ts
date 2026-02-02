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
