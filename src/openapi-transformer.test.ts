import { describe, it, expect, beforeEach } from 'vitest';
import { OpenApiTransformer } from './openapi-transformer.js';
import { ControllerMethodInfo, ResolvedParameter } from './nest-resolved-method.js';

describe('OpenApiTransformer', () => {
  let transformer: OpenApiTransformer;

  beforeEach(() => {
    transformer = new OpenApiTransformer();
  });

  // Test helper to create method info with defaults
  function createMethodInfo(overrides: Partial<ControllerMethodInfo> = {}): ControllerMethodInfo {
    return {
      httpMethod: 'GET',
      path: '/test',
      methodName: 'testMethod',
      controllerName: 'TestController',
      controllerTags: ['test'],
      returnType: { type: 'TestDto' },
      parameters: [],
      ...overrides
    };
  }

  describe('Path transformation', () => {
    it('should transform NestJS paths to OpenAPI format', () => {
      const methodInfo = createMethodInfo({
        path: '/users/{id}/profile/{section}',
        methodName: 'getUserProfile',
        controllerName: 'UsersController',
        controllerTags: ['users'],
        returnType: { type: 'UserProfileDto' }
      });

      const result = transformer.transformMethodInfo(methodInfo);
      
      expect(result['/users/{id}/profile/{section}']).toBeDefined();
      expect(result['/users/{id}/profile/{section}'].get).toBeDefined();
    });

    it('should transform :param to {param} syntax', () => {
      const methodInfo = createMethodInfo({
        path: '/users/:id/profile/:section',
        methodName: 'getUserProfile',
        controllerName: 'UsersController',
        controllerTags: ['users'],
        returnType: { type: 'UserProfileDto' }
      });

      const result = transformer.transformMethodInfo(methodInfo);
      
      expect(result['/users/{id}/profile/{section}']).toBeDefined();
      expect(result['/users/{id}/profile/{section}'].get).toBeDefined();
    });
  });

  describe('Operation metadata', () => {
    it('should generate correct operationId and summary', () => {
      const methodInfo: ControllerMethodInfo = {
        httpMethod: 'POST',
        path: '/users',
        methodName: 'createUser',
        controllerName: 'UsersController',
        controllerTags: ['User Management'],
        returnType: { type: 'UserDto' },
        parameters: []
      };

      const result = transformer.transformMethodInfo(methodInfo);
      const operation = result['/users'].post;

      expect(operation.operationId).toBe('UsersController_createUser');
      expect(operation.summary).toBe('UsersController.createUser');
      expect(operation.tags).toEqual(['User Management']);
    });

    it('should handle empty tags', () => {
      const methodInfo: ControllerMethodInfo = {
        httpMethod: 'GET',
        path: '/health',
        methodName: 'check',
        controllerName: 'HealthController',
        controllerTags: [],
        returnType: { type: 'HealthStatus' },
        parameters: []
      };

      const result = transformer.transformMethodInfo(methodInfo);
      const operation = result['/health'].get;

      expect(operation.tags).toBeUndefined();
    });
  });

  describe('Parameter transformation', () => {
    it('should transform query parameters with descriptions', () => {
      const parameters: ResolvedParameter[] = [
        {
          name: 'limit',
          type: 'query',
          tsType: 'number',
          required: false,
          description: 'Maximum number of results to return'
        },
        {
          name: 'search',
          type: 'query', 
          tsType: 'string',
          required: true,
          description: 'Search term for filtering'
        }
      ];

      const methodInfo: ControllerMethodInfo = {
        httpMethod: 'GET',
        path: '/users',
        methodName: 'getUsers',
        controllerName: 'UsersController',
        controllerTags: ['users'],
        returnType: { type: 'UserDto[]' },
        parameters
      };

      const result = transformer.transformMethodInfo(methodInfo);
      const operation = result['/users'].get;

      expect(operation.parameters).toHaveLength(2);
      
      const limitParam = operation.parameters?.find(p => p.name === 'limit');
      expect(limitParam).toMatchObject({
        name: 'limit',
        in: 'query',
        description: 'Maximum number of results to return',
        required: false,
        schema: { type: 'number' }
      });

      const searchParam = operation.parameters?.find(p => p.name === 'search');
      expect(searchParam).toMatchObject({
        name: 'search',
        in: 'query',
        description: 'Search term for filtering',
        required: true,
        schema: { type: 'string' }
      });
    });

    it('should transform path parameters', () => {
      const parameters: ResolvedParameter[] = [
        {
          name: 'id',
          type: 'path',
          tsType: 'string',
          required: true,
          description: 'User unique identifier'
        }
      ];

      const methodInfo: ControllerMethodInfo = {
        httpMethod: 'GET',
        path: '/users/{id}',
        methodName: 'getUser',
        controllerName: 'UsersController',
        controllerTags: ['users'],
        returnType: { type: 'UserDto' },
        parameters
      };

      const result = transformer.transformMethodInfo(methodInfo);
      const operation = result['/users/{id}'].get;

      expect(operation.parameters).toHaveLength(1);
      expect(operation.parameters?.[0]).toMatchObject({
        name: 'id',
        in: 'path',
        description: 'User unique identifier',
        required: true,
        schema: { type: 'string' }
      });
    });

    it('should use fallback descriptions for parameters without descriptions', () => {
      const parameters: ResolvedParameter[] = [
        {
          name: 'sort',
          type: 'query',
          tsType: 'string',
          required: false
        }
      ];

      const methodInfo: ControllerMethodInfo = {
        httpMethod: 'GET',
        path: '/users',
        methodName: 'getUsers',
        controllerName: 'UsersController',
        controllerTags: ['users'],
        returnType: { type: 'UserDto[]' },
        parameters
      };

      const result = transformer.transformMethodInfo(methodInfo);
      const operation = result['/users'].get;

      expect(operation.parameters?.[0]).toMatchObject({
        name: 'sort',
        in: 'query',
        description: 'query parameter: sort',
        required: false,
        schema: { type: 'string' }
      });
    });

    it('should transform body parameters', () => {
      const parameters: ResolvedParameter[] = [
        {
          name: 'createUserDto',
          type: 'body',
          tsType: 'CreateUserDto',
          required: true,
          description: 'User creation data'
        }
      ];

      const methodInfo: ControllerMethodInfo = {
        httpMethod: 'POST',
        path: '/users',
        methodName: 'createUser',
        controllerName: 'UsersController',
        controllerTags: ['users'],
        returnType: { type: 'UserDto' },
        parameters
      };

      const result = transformer.transformMethodInfo(methodInfo);
      const operation = result['/users'].post;

      expect(operation.parameters).toBeUndefined();
      expect(operation.requestBody).toMatchObject({
        description: 'Request body parameter: createUserDto',
        required: true,
        content: {
          'application/json': {
            schema: {
              '$ref': '#/components/schemas/CreateUserDto'
            }
          }
        }
      });
    });
  });

  describe('Response transformation', () => {
    it('should generate responses for simple return types', () => {
      const methodInfo: ControllerMethodInfo = {
        httpMethod: 'GET',
        path: '/user',
        methodName: 'getUser',
        controllerName: 'UsersController',
        controllerTags: ['users'],
        returnType: { type: 'UserDto' },
        parameters: []
      };

      const result = transformer.transformMethodInfo(methodInfo);
      const operation = result['/user'].get;

      expect(operation.responses).toMatchObject({
        '200': {
          description: 'Success',
          content: {
            'application/json': {
              schema: {
                '$ref': '#/components/schemas/UserDto'
              }
            }
          }
        }
      });
    });

    it('should generate responses for array return types', () => {
      const methodInfo: ControllerMethodInfo = {
        httpMethod: 'GET',
        path: '/users',
        methodName: 'getUsers',
        controllerName: 'UsersController',
        controllerTags: ['users'],
        returnType: { type: 'UserDto', container: 'array' },
        parameters: []
      };

      const result = transformer.transformMethodInfo(methodInfo);
      const operation = result['/users'].get;

      expect(operation.responses).toMatchObject({
        '200': {
          description: 'Success',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: {
                  '$ref': '#/components/schemas/UserDto'
                }
              }
            }
          }
        }
      });
    });

    it('should handle inline return types', () => {
      const methodInfo: ControllerMethodInfo = {
        httpMethod: 'GET',
        path: '/status',
        methodName: 'getStatus',
        controllerName: 'HealthController',
        controllerTags: ['health'],
        returnType: { inline: '{ status: string; uptime: number }' },
        parameters: []
      };

      const result = transformer.transformMethodInfo(methodInfo);
      const operation = result['/status'].get;

      expect(operation.responses).toMatchObject({
        '200': {
          description: 'Success',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                description: 'Inline type: { status: string; uptime: number }'
              }
            }
          }
        }
      });
    });
  });

  describe('TypeScript type mapping', () => {
    it('should map basic TypeScript types to OpenAPI types', () => {
      const testCases = [
        { tsType: 'string', expected: { type: 'string' } },
        { tsType: 'number', expected: { type: 'number' } },
        { tsType: 'boolean', expected: { type: 'boolean' } },
        { tsType: 'Date', expected: { type: 'string', format: 'date-time' } },
        { tsType: 'unknown', expected: { type: 'object' } },
        { tsType: 'CustomDto', expected: { '$ref': '#/components/schemas/CustomDto' } }
      ];

      testCases.forEach(({ tsType, expected }) => {
        const methodInfo: ControllerMethodInfo = {
          httpMethod: 'GET',
          path: '/test',
          methodName: 'test',
          controllerName: 'TestController',
          controllerTags: ['test'],
          returnType: { type: 'string' },
          parameters: [{
            name: 'param',
            type: 'query',
            tsType,
            required: false
          }]
        };

        const result = transformer.transformMethodInfo(methodInfo);
        const param = result['/test'].get.parameters?.[0];
        
        expect(param?.schema).toEqual(expected);
      });
    });

    it('should handle union types', () => {
      const methodInfo: ControllerMethodInfo = {
        httpMethod: 'GET',
        path: '/test',
        methodName: 'test',
        controllerName: 'TestController',
        controllerTags: ['test'],
        returnType: { type: 'string' },
        parameters: [{
          name: 'param',
          type: 'query',
          tsType: 'string | number',
          required: false
        }]
      };

      const result = transformer.transformMethodInfo(methodInfo);
      const param = result['/test'].get.parameters?.[0];
      
      expect(param?.schema).toEqual({
        oneOf: [
          { type: 'string' },
          { type: 'number' }
        ]
      });
    });
  });
});
