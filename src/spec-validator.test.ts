import { describe, it, expect } from 'vitest';
import {
  validateSpec,
  categorizeBrokenRefs,
  formatValidationResult,
} from './spec-validator.js';
import type { OpenApiSpec } from './types.js';

describe('spec-validator', () => {
  describe('validateSpec', () => {
    it('should return valid for spec with no refs', () => {
      const spec: OpenApiSpec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0' },
        paths: {},
      };

      const result = validateSpec(spec);
      expect(result.valid).toBe(true);
      expect(result.totalRefs).toBe(0);
      expect(result.brokenRefCount).toBe(0);
    });

    it('should return valid when all refs are resolved', () => {
      const spec: OpenApiSpec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0' },
        paths: {
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
        },
        components: {
          schemas: {
            User: { type: 'object' },
          },
        },
      };

      const result = validateSpec(spec);
      expect(result.valid).toBe(true);
      expect(result.totalRefs).toBe(1);
      expect(result.brokenRefCount).toBe(0);
    });

    it('should detect broken refs', () => {
      const spec: OpenApiSpec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              responses: {
                '200': {
                  description: 'Success',
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/MissingDto' },
                    },
                  },
                },
              },
            },
          },
        },
        components: {
          schemas: {},
        },
      };

      const result = validateSpec(spec);
      expect(result.valid).toBe(false);
      expect(result.brokenRefCount).toBe(1);
      expect(result.missingSchemas.get('MissingDto')).toBe(1);
    });

    it('should count multiple usages of same missing schema', () => {
      const spec: OpenApiSpec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              responses: {
                '200': {
                  description: 'Success',
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/MissingDto' },
                    },
                  },
                },
              },
            },
            post: {
              operationId: 'createUser',
              responses: {
                '201': {
                  description: 'Created',
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/MissingDto' },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const result = validateSpec(spec);
      expect(result.valid).toBe(false);
      expect(result.brokenRefCount).toBe(2);
      expect(result.missingSchemas.get('MissingDto')).toBe(2);
      expect(result.missingSchemas.size).toBe(1);
    });

    it('should detect refs in request body schemas', () => {
      const spec: OpenApiSpec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0' },
        paths: {
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
        },
      };

      const result = validateSpec(spec);
      expect(result.valid).toBe(false);
      expect(result.missingSchemas.has('CreateUserDto')).toBe(true);
    });

    it('should detect refs in nested schema properties', () => {
      const spec: OpenApiSpec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0' },
        paths: {},
        components: {
          schemas: {
            User: {
              type: 'object',
              properties: {
                address: { $ref: '#/components/schemas/Address' },
              },
            },
          },
        },
      };

      const result = validateSpec(spec);
      expect(result.valid).toBe(false);
      expect(result.missingSchemas.has('Address')).toBe(true);
    });
  });

  describe('categorizeBrokenRefs', () => {
    it('should categorize primitive types', () => {
      const missing = new Map([
        ['string', 5],
        ['number', 2],
        ['boolean', 1],
      ]);

      const categories = categorizeBrokenRefs(missing);
      expect(categories.primitives).toEqual(['string', 'number', 'boolean']);
      expect(categories.unionTypes).toEqual([]);
      expect(categories.queryParams).toEqual([]);
      expect(categories.other).toEqual([]);
    });

    it('should categorize union types', () => {
      const missing = new Map([
        ['void | UserDto', 1],
        ['UserDto | null', 2],
      ]);

      const categories = categorizeBrokenRefs(missing);
      expect(categories.primitives).toEqual([]);
      expect(categories.unionTypes).toContain('void | UserDto');
      expect(categories.unionTypes).toContain('UserDto | null');
    });

    it('should categorize query params', () => {
      const missing = new Map([
        ['GetUsersQueryParams', 1],
        ['UpdateUserPathParams', 1],
      ]);

      const categories = categorizeBrokenRefs(missing);
      expect(categories.queryParams).toContain('GetUsersQueryParams');
      expect(categories.queryParams).toContain('UpdateUserPathParams');
    });

    it('should categorize other schemas', () => {
      const missing = new Map([
        ['UserResponseDto', 1],
        ['StreamableFile', 3],
      ]);

      const categories = categorizeBrokenRefs(missing);
      expect(categories.other).toContain('UserResponseDto');
      expect(categories.other).toContain('StreamableFile');
    });
  });

  describe('formatValidationResult', () => {
    it('should format valid result', () => {
      const result = {
        valid: true,
        totalRefs: 10,
        brokenRefCount: 0,
        brokenRefs: [],
        missingSchemas: new Map(),
      };

      const formatted = formatValidationResult(result);
      expect(formatted).toContain('valid');
      expect(formatted).toContain('10 schema refs');
    });

    it('should format invalid result with categories', () => {
      const result = {
        valid: false,
        totalRefs: 20,
        brokenRefCount: 5,
        brokenRefs: [],
        missingSchemas: new Map([
          ['string', 2],
          ['void | UserDto', 1],
          ['GetUserQueryParams', 1],
          ['MissingDto', 1],
        ]),
      };

      const formatted = formatValidationResult(result);
      expect(formatted).toContain('5 broken refs');
      expect(formatted).toContain('Primitive types');
      expect(formatted).toContain('string');
      expect(formatted).toContain('Union types');
      expect(formatted).toContain('void | UserDto');
      expect(formatted).toContain('Query/Path params');
      expect(formatted).toContain('GetUserQueryParams');
      expect(formatted).toContain('Other missing schemas');
      expect(formatted).toContain('MissingDto');
    });
  });
});
