import { describe, it, expect } from 'vitest';
import {
  mergeSchemas,
  mergeGeneratedSchemas,
  filterSchemas,
} from './schema-merger.js';
import type { GeneratedSchemas } from './schema-generator.js';
import type { OpenApiPaths } from './types.js';

describe('schema-merger', () => {
  describe('mergeSchemas', () => {
    it('should include only referenced schemas', () => {
      const paths: OpenApiPaths = {
        '/users': {
          get: {
            operationId: 'getUsers',
            responses: {
              '200': {
                description: 'Success',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/User' },
                  },
                },
              },
            },
          },
        },
      };

      const schemas: GeneratedSchemas = {
        definitions: {
          User: { type: 'object' },
          Post: { type: 'object' }, // Not referenced, should be excluded
          Comment: { type: 'object' }, // Not referenced, should be excluded
        },
      };

      const result = mergeSchemas(paths, schemas);

      expect(result.schemas['User']).toBeDefined();
      expect(result.schemas['Post']).toBeUndefined();
      expect(result.schemas['Comment']).toBeUndefined();
    });

    it('should include nested schema references', () => {
      const paths: OpenApiPaths = {
        '/users': {
          get: {
            operationId: 'getUsers',
            responses: {
              '200': {
                description: 'Success',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/User' },
                  },
                },
              },
            },
          },
        },
      };

      const schemas: GeneratedSchemas = {
        definitions: {
          User: {
            type: 'object',
            properties: {
              profile: { $ref: '#/components/schemas/Profile' },
            },
          },
          Profile: {
            type: 'object',
            properties: {
              address: { $ref: '#/components/schemas/Address' },
            },
          },
          Address: { type: 'object' },
          Unrelated: { type: 'object' }, // Not referenced
        },
      };

      const result = mergeSchemas(paths, schemas);

      expect(result.schemas['User']).toBeDefined();
      expect(result.schemas['Profile']).toBeDefined();
      expect(result.schemas['Address']).toBeDefined();
      expect(result.schemas['Unrelated']).toBeUndefined();
    });

    it('should extract references from request bodies', () => {
      const paths: OpenApiPaths = {
        '/users': {
          post: {
            operationId: 'createUser',
            requestBody: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CreateUserDto' },
                },
              },
            },
            responses: {
              '201': { description: 'Created' },
            },
          },
        },
      };

      const schemas: GeneratedSchemas = {
        definitions: {
          CreateUserDto: { type: 'object' },
        },
      };

      const result = mergeSchemas(paths, schemas);

      expect(result.schemas['CreateUserDto']).toBeDefined();
    });

    it('should extract references from parameters', () => {
      const paths: OpenApiPaths = {
        '/users': {
          get: {
            operationId: 'getUsers',
            parameters: [
              {
                name: 'filter',
                in: 'query',
                required: false,
                schema: { $ref: '#/components/schemas/UserFilter' },
              },
            ],
            responses: {
              '200': { description: 'Success' },
            },
          },
        },
      };

      const schemas: GeneratedSchemas = {
        definitions: {
          UserFilter: { type: 'object' },
        },
      };

      const result = mergeSchemas(paths, schemas);

      expect(result.schemas['UserFilter']).toBeDefined();
    });
  });

  describe('nullable normalization (type array to nullable: true)', () => {
    it('should normalize type: [T, "null"] to nullable: true', () => {
      const paths: OpenApiPaths = {
        '/users': {
          get: {
            operationId: 'getUsers',
            responses: {
              '200': {
                description: 'Success',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/User' },
                  },
                },
              },
            },
          },
        },
      };

      const schemas: GeneratedSchemas = {
        definitions: {
          User: {
            type: 'object',
            properties: {
              bio: { type: ['string', 'null'] },
            },
          },
        },
      };

      const result = mergeSchemas(paths, schemas);

      expect(result.schemas['User'].properties?.bio).toEqual({
        type: 'string',
        nullable: true,
      });
    });

    it('should normalize nested nullable in items', () => {
      const paths: OpenApiPaths = {
        '/users': {
          get: {
            operationId: 'getUsers',
            responses: {
              '200': {
                description: 'Success',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/UserList' },
                  },
                },
              },
            },
          },
        },
      };

      const schemas: GeneratedSchemas = {
        definitions: {
          UserList: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: { type: ['number', 'null'] },
              },
            },
          },
        },
      };

      const result = mergeSchemas(paths, schemas);

      const items = result.schemas['UserList'].properties?.items as any;
      expect(items.items).toEqual({ type: 'number', nullable: true });
    });

    it('should leave non-null types unchanged', () => {
      const paths: OpenApiPaths = {
        '/users': {
          get: {
            operationId: 'getUsers',
            responses: {
              '200': {
                description: 'Success',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/User' },
                  },
                },
              },
            },
          },
        },
      };

      const schemas: GeneratedSchemas = {
        definitions: {
          User: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
          },
        },
      };

      const result = mergeSchemas(paths, schemas);

      expect(result.schemas['User'].properties?.name).toEqual({
        type: 'string',
      });
    });
  });

  describe('mergeGeneratedSchemas', () => {
    it('should merge multiple schema objects', () => {
      const schemas1: GeneratedSchemas = {
        definitions: {
          User: { type: 'object' },
        },
      };

      const schemas2: GeneratedSchemas = {
        definitions: {
          Post: { type: 'object' },
        },
      };

      const result = mergeGeneratedSchemas(schemas1, schemas2);

      expect(result.definitions['User']).toBeDefined();
      expect(result.definitions['Post']).toBeDefined();
    });

    it('should override schemas with same name', () => {
      const schemas1: GeneratedSchemas = {
        definitions: {
          User: { type: 'object', description: 'First' },
        },
      };

      const schemas2: GeneratedSchemas = {
        definitions: {
          User: { type: 'object', description: 'Second' },
        },
      };

      const result = mergeGeneratedSchemas(schemas1, schemas2);

      expect(result.definitions['User'].description).toBe('Second');
    });
  });

  describe('filterSchemas', () => {
    it('should include only matching patterns', () => {
      const schemas: GeneratedSchemas = {
        definitions: {
          CreateUserDto: { type: 'object' },
          UpdateUserDto: { type: 'object' },
          User: { type: 'object' },
        },
      };

      const result = filterSchemas(schemas, ['*Dto']);

      expect(result.definitions['CreateUserDto']).toBeDefined();
      expect(result.definitions['UpdateUserDto']).toBeDefined();
      expect(result.definitions['User']).toBeUndefined();
    });

    it('should exclude matching patterns', () => {
      const schemas: GeneratedSchemas = {
        definitions: {
          InternalType: { type: 'object' },
          User: { type: 'object' },
          Post: { type: 'object' },
        },
      };

      const result = filterSchemas(schemas, undefined, ['Internal*']);

      expect(result.definitions['User']).toBeDefined();
      expect(result.definitions['Post']).toBeDefined();
      expect(result.definitions['InternalType']).toBeUndefined();
    });
  });
});
