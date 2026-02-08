import { describe, it, expect } from 'vitest';
import { Option } from 'effect';
import { transformMethod } from './transformer.js';
import type { MethodInfo, ResolvedParameter } from './domain.js';

// Test helper to create method info with defaults
function createMethodInfo(overrides: Partial<MethodInfo> = {}): MethodInfo {
  return {
    httpMethod: 'GET',
    path: '/test',
    methodName: 'testMethod',
    controllerName: 'TestController',
    controllerTags: ['test'],
    returnType: {
      type: Option.some('TestDto'),
      inline: Option.none(),
      container: Option.none(),
      filePath: Option.none(),
    },
    parameters: [],
    decorators: [],
    operation: {
      summary: Option.none(),
      description: Option.none(),
      operationId: Option.none(),
      deprecated: Option.none(),
    },
    responses: [],
    httpCode: Option.none(),
    consumes: [],
    produces: [],
    security: [],
    ...overrides,
  };
}

describe('transformMethod', () => {
  describe('Path transformation', () => {
    it('should transform NestJS paths to OpenAPI format', () => {
      const methodInfo = createMethodInfo({
        path: '/users/{id}/profile/{section}',
        methodName: 'getUserProfile',
        controllerName: 'UsersController',
        controllerTags: ['users'],
        returnType: {
          type: Option.some('UserProfileDto'),
          inline: Option.none(),
          container: Option.none(),
          filePath: Option.none(),
        },
      });

      const result = transformMethod(methodInfo);

      expect(result['/users/{id}/profile/{section}']).toBeDefined();
      expect(result['/users/{id}/profile/{section}'].get).toBeDefined();
    });

    it('should transform :param to {param} syntax', () => {
      const methodInfo = createMethodInfo({
        path: '/users/:id/profile/:section',
        methodName: 'getUserProfile',
        controllerName: 'UsersController',
        controllerTags: ['users'],
        returnType: {
          type: Option.some('UserProfileDto'),
          inline: Option.none(),
          container: Option.none(),
          filePath: Option.none(),
        },
      });

      const result = transformMethod(methodInfo);

      expect(result['/users/{id}/profile/{section}']).toBeDefined();
      expect(result['/users/{id}/profile/{section}'].get).toBeDefined();
    });
  });

  describe('Operation metadata', () => {
    it('should generate correct operationId and summary', () => {
      const methodInfo: MethodInfo = {
        httpMethod: 'POST',
        path: '/users',
        methodName: 'createUser',
        controllerName: 'UsersController',
        controllerTags: ['User Management'],
        returnType: {
          type: Option.some('UserDto'),
          inline: Option.none(),
          container: Option.none(),
          filePath: Option.none(),
        },
        parameters: [],
        decorators: [],
        operation: {
          summary: Option.none(),
          description: Option.none(),
          operationId: Option.none(),
          deprecated: Option.none(),
        },
        responses: [],
        httpCode: Option.none(),
        consumes: [],
        produces: [],
        security: [],
      };

      const result = transformMethod(methodInfo);
      const operation = result['/users'].post;

      expect(operation.operationId).toBe('UsersController_createUser');
      // summary is only included when explicitly provided via @ApiOperation
      expect(operation.summary).toBeUndefined();
      expect(operation.tags).toEqual(['User Management']);
    });

    it('should handle empty tags', () => {
      const methodInfo: MethodInfo = {
        httpMethod: 'GET',
        path: '/health',
        methodName: 'check',
        controllerName: 'HealthController',
        controllerTags: [],
        returnType: {
          type: Option.some('HealthStatus'),
          inline: Option.none(),
          container: Option.none(),
          filePath: Option.none(),
        },
        parameters: [],
        decorators: [],
        operation: {
          summary: Option.none(),
          description: Option.none(),
          operationId: Option.none(),
          deprecated: Option.none(),
        },
        responses: [],
        httpCode: Option.none(),
        consumes: [],
        produces: [],
        security: [],
      };

      const result = transformMethod(methodInfo);
      const operation = result['/health'].get;

      expect(operation.tags).toBeUndefined();
    });

    it('should use custom summary from @ApiOperation', () => {
      const methodInfo = createMethodInfo({
        operation: {
          summary: Option.some('Get all users from the system'),
          description: Option.none(),
          operationId: Option.none(),
          deprecated: Option.none(),
        },
      });

      const result = transformMethod(methodInfo);
      const operation = result['/test'].get;

      expect(operation.summary).toBe('Get all users from the system');
    });

    it('should use custom description from @ApiOperation', () => {
      const methodInfo = createMethodInfo({
        operation: {
          summary: Option.none(),
          description: Option.some(
            'Retrieves a list of all users with optional filtering',
          ),
          operationId: Option.none(),
          deprecated: Option.none(),
        },
      });

      const result = transformMethod(methodInfo);
      const operation = result['/test'].get;

      expect(operation.description).toBe(
        'Retrieves a list of all users with optional filtering',
      );
    });

    it('should use custom operationId from @ApiOperation', () => {
      const methodInfo = createMethodInfo({
        operation: {
          summary: Option.none(),
          description: Option.none(),
          operationId: Option.some('listAllUsers'),
          deprecated: Option.none(),
        },
      });

      const result = transformMethod(methodInfo);
      const operation = result['/test'].get;

      expect(operation.operationId).toBe('listAllUsers');
    });

    it('should set deprecated flag from @ApiOperation', () => {
      const methodInfo = createMethodInfo({
        operation: {
          summary: Option.none(),
          description: Option.none(),
          operationId: Option.none(),
          deprecated: Option.some(true),
        },
      });

      const result = transformMethod(methodInfo);
      const operation = result['/test'].get;

      expect(operation.deprecated).toBe(true);
    });

    it('should not include deprecated when not specified', () => {
      const methodInfo = createMethodInfo({
        operation: {
          summary: Option.none(),
          description: Option.none(),
          operationId: Option.none(),
          deprecated: Option.none(),
        },
      });

      const result = transformMethod(methodInfo);
      const operation = result['/test'].get;

      expect(operation.deprecated).toBeUndefined();
    });
  });

  describe('Parameter transformation', () => {
    it('should transform query parameters with descriptions', () => {
      const parameters: ResolvedParameter[] = [
        {
          name: 'limit',
          location: 'query',
          tsType: 'number',
          required: false,
          description: Option.some('Maximum number of results to return'),
        },
        {
          name: 'search',
          location: 'query',
          tsType: 'string',
          required: true,
          description: Option.some('Search term for filtering'),
        },
      ];

      const methodInfo: MethodInfo = {
        httpMethod: 'GET',
        path: '/users',
        methodName: 'getUsers',
        controllerName: 'UsersController',
        controllerTags: ['users'],
        returnType: {
          type: Option.some('UserDto[]'),
          inline: Option.none(),
          container: Option.none(),
          filePath: Option.none(),
        },
        parameters,
        decorators: [],
        operation: {
          summary: Option.none(),
          description: Option.none(),
          operationId: Option.none(),
          deprecated: Option.none(),
        },
        responses: [],
        httpCode: Option.none(),
        consumes: [],
        produces: [],
        security: [],
      };

      const result = transformMethod(methodInfo);
      const operation = result['/users'].get;

      expect(operation.parameters).toHaveLength(2);

      const limitParam = operation.parameters?.find((p) => p.name === 'limit');
      expect(limitParam).toMatchObject({
        name: 'limit',
        in: 'query',
        description: 'Maximum number of results to return',
        required: false,
        schema: { type: 'number' },
      });

      const searchParam = operation.parameters?.find(
        (p) => p.name === 'search',
      );
      expect(searchParam).toMatchObject({
        name: 'search',
        in: 'query',
        description: 'Search term for filtering',
        required: true,
        schema: { type: 'string' },
      });
    });

    it('should transform path parameters', () => {
      const parameters: ResolvedParameter[] = [
        {
          name: 'id',
          location: 'path',
          tsType: 'string',
          required: true,
          description: Option.some('User unique identifier'),
        },
      ];

      const methodInfo: MethodInfo = {
        httpMethod: 'GET',
        path: '/users/{id}',
        methodName: 'getUser',
        controllerName: 'UsersController',
        controllerTags: ['users'],
        returnType: {
          type: Option.some('UserDto'),
          inline: Option.none(),
          container: Option.none(),
          filePath: Option.none(),
        },
        parameters,
        decorators: [],
        operation: {
          summary: Option.none(),
          description: Option.none(),
          operationId: Option.none(),
          deprecated: Option.none(),
        },
        responses: [],
        httpCode: Option.none(),
        consumes: [],
        produces: [],
        security: [],
      };

      const result = transformMethod(methodInfo);
      const operation = result['/users/{id}'].get;

      expect(operation.parameters).toHaveLength(1);
      expect(operation.parameters?.[0]).toMatchObject({
        name: 'id',
        in: 'path',
        description: 'User unique identifier',
        required: true,
        schema: { type: 'string' },
      });
    });

    it('should use fallback descriptions for parameters without descriptions', () => {
      const parameters: ResolvedParameter[] = [
        {
          name: 'sort',
          location: 'query',
          tsType: 'string',
          required: false,
          description: Option.none(),
        },
      ];

      const methodInfo: MethodInfo = {
        httpMethod: 'GET',
        path: '/users',
        methodName: 'getUsers',
        controllerName: 'UsersController',
        controllerTags: ['users'],
        returnType: {
          type: Option.some('UserDto[]'),
          inline: Option.none(),
          container: Option.none(),
          filePath: Option.none(),
        },
        parameters,
        decorators: [],
        operation: {
          summary: Option.none(),
          description: Option.none(),
          operationId: Option.none(),
          deprecated: Option.none(),
        },
        responses: [],
        httpCode: Option.none(),
        consumes: [],
        produces: [],
        security: [],
      };

      const result = transformMethod(methodInfo);
      const operation = result['/users'].get;

      expect(operation.parameters?.[0]).toMatchObject({
        name: 'sort',
        in: 'query',
        description: 'query parameter: sort',
        required: false,
        schema: { type: 'string' },
      });
    });

    it('should transform body parameters', () => {
      const parameters: ResolvedParameter[] = [
        {
          name: 'createUserDto',
          location: 'body',
          tsType: 'CreateUserDto',
          required: true,
          description: Option.some('User creation data'),
        },
      ];

      const methodInfo: MethodInfo = {
        httpMethod: 'POST',
        path: '/users',
        methodName: 'createUser',
        controllerName: 'UsersController',
        controllerTags: ['users'],
        returnType: {
          type: Option.some('UserDto'),
          inline: Option.none(),
          container: Option.none(),
          filePath: Option.none(),
        },
        parameters,
        decorators: [],
        operation: {
          summary: Option.none(),
          description: Option.none(),
          operationId: Option.none(),
          deprecated: Option.none(),
        },
        responses: [],
        httpCode: Option.none(),
        consumes: [],
        produces: [],
        security: [],
      };

      const result = transformMethod(methodInfo);
      const operation = result['/users'].post;

      expect(operation.parameters).toEqual([]);
      expect(operation.requestBody).toMatchObject({
        description: 'Request body parameter: createUserDto',
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/CreateUserDto',
            },
          },
        },
      });
    });
  });

  describe('Response transformation', () => {
    it('should generate responses for simple return types', () => {
      const methodInfo: MethodInfo = {
        httpMethod: 'GET',
        path: '/user',
        methodName: 'getUser',
        controllerName: 'UsersController',
        controllerTags: ['users'],
        returnType: {
          type: Option.some('UserDto'),
          inline: Option.none(),
          container: Option.none(),
          filePath: Option.none(),
        },
        parameters: [],
        decorators: [],
        operation: {
          summary: Option.none(),
          description: Option.none(),
          operationId: Option.none(),
          deprecated: Option.none(),
        },
        responses: [],
        httpCode: Option.none(),
        consumes: [],
        produces: [],
        security: [],
      };

      const result = transformMethod(methodInfo);
      const operation = result['/user'].get;

      expect(operation.responses).toMatchObject({
        '200': {
          description: '',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/UserDto',
              },
            },
          },
        },
      });
    });

    it('should generate responses for array return types', () => {
      const methodInfo: MethodInfo = {
        httpMethod: 'GET',
        path: '/users',
        methodName: 'getUsers',
        controllerName: 'UsersController',
        controllerTags: ['users'],
        returnType: {
          type: Option.some('UserDto'),
          inline: Option.none(),
          container: Option.some('array'),
          filePath: Option.none(),
        },
        parameters: [],
        decorators: [],
        operation: {
          summary: Option.none(),
          description: Option.none(),
          operationId: Option.none(),
          deprecated: Option.none(),
        },
        responses: [],
        httpCode: Option.none(),
        consumes: [],
        produces: [],
        security: [],
      };

      const result = transformMethod(methodInfo);
      const operation = result['/users'].get;

      expect(operation.responses).toMatchObject({
        '200': {
          description: '',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: {
                  $ref: '#/components/schemas/UserDto',
                },
              },
            },
          },
        },
      });
    });

    it('should handle inline return types', () => {
      const methodInfo: MethodInfo = {
        httpMethod: 'GET',
        path: '/status',
        methodName: 'getStatus',
        controllerName: 'HealthController',
        controllerTags: ['health'],
        returnType: {
          type: Option.none(),
          inline: Option.some('{ status: string; uptime: number }'),
          container: Option.none(),
          filePath: Option.none(),
        },
        parameters: [],
        decorators: [],
        operation: {
          summary: Option.none(),
          description: Option.none(),
          operationId: Option.none(),
          deprecated: Option.none(),
        },
        responses: [],
        httpCode: Option.none(),
        consumes: [],
        produces: [],
        security: [],
      };

      const result = transformMethod(methodInfo);
      const operation = result['/status'].get;

      expect(operation.responses).toMatchObject({
        '200': {
          description: '',
          content: {
            'application/json': {
              schema: {
                type: 'object',
              },
            },
          },
        },
      });
    });
  });

  describe('Multiple response codes', () => {
    it('should use @ApiResponse decorators when present', () => {
      const methodInfo = createMethodInfo({
        httpMethod: 'GET',
        path: '/users/{id}',
        methodName: 'getUser',
        responses: [
          {
            statusCode: 200,
            description: Option.some('User found'),
            type: Option.some('UserDto'),
            isArray: false,
          },
          {
            statusCode: 404,
            description: Option.some('User not found'),
            type: Option.none(),
            isArray: false,
          },
        ],
      });

      const result = transformMethod(methodInfo);
      const operation = result['/users/{id}'].get;

      expect(operation.responses).toMatchObject({
        '200': {
          description: 'User found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UserDto' },
            },
          },
        },
        '404': {
          description: 'User not found',
        },
      });
    });

    it('should handle array response types from @ApiResponse', () => {
      const methodInfo = createMethodInfo({
        httpMethod: 'GET',
        path: '/users',
        methodName: 'getUsers',
        responses: [
          {
            statusCode: 200,
            description: Option.some('List of users'),
            type: Option.some('UserDto'),
            isArray: true,
          },
        ],
      });

      const result = transformMethod(methodInfo);
      const operation = result['/users'].get;

      expect(
        operation.responses['200'].content?.['application/json'].schema,
      ).toMatchObject({
        type: 'array',
        items: { $ref: '#/components/schemas/UserDto' },
      });
    });

    it('should use @HttpCode to determine default success status', () => {
      const methodInfo = createMethodInfo({
        httpMethod: 'POST',
        path: '/users',
        methodName: 'createUser',
        httpCode: Option.some(201),
        returnType: {
          type: Option.some('UserDto'),
          inline: Option.none(),
          container: Option.none(),
          filePath: Option.none(),
        },
        responses: [], // No @ApiResponse, uses return type
      });

      const result = transformMethod(methodInfo);
      const operation = result['/users'].post;

      expect(operation.responses).toHaveProperty('201');
      expect(operation.responses).not.toHaveProperty('200');
    });

    it('should default POST to 201 when no @HttpCode', () => {
      const methodInfo = createMethodInfo({
        httpMethod: 'POST',
        path: '/users',
        methodName: 'createUser',
        httpCode: Option.none(),
        returnType: {
          type: Option.some('UserDto'),
          inline: Option.none(),
          container: Option.none(),
          filePath: Option.none(),
        },
        responses: [],
      });

      const result = transformMethod(methodInfo);
      const operation = result['/users'].post;

      expect(operation.responses).toHaveProperty('201');
    });

    it('should default GET to 200 when no @HttpCode', () => {
      const methodInfo = createMethodInfo({
        httpMethod: 'GET',
        path: '/users',
        methodName: 'getUsers',
        httpCode: Option.none(),
        responses: [],
      });

      const result = transformMethod(methodInfo);
      const operation = result['/users'].get;

      expect(operation.responses).toHaveProperty('200');
    });

    it('should handle 204 No Content responses', () => {
      const methodInfo = createMethodInfo({
        httpMethod: 'DELETE',
        path: '/users/{id}',
        methodName: 'deleteUser',
        responses: [
          {
            statusCode: 204,
            description: Option.some('User deleted'),
            type: Option.none(),
            isArray: false,
          },
          {
            statusCode: 404,
            description: Option.some('User not found'),
            type: Option.none(),
            isArray: false,
          },
        ],
      });

      const result = transformMethod(methodInfo);
      const operation = result['/users/{id}'].delete;

      expect(operation.responses).toMatchObject({
        '204': {
          description: 'User deleted',
        },
        '404': {
          description: 'User not found',
        },
      });
      expect(operation.responses['204'].content).toBeUndefined();
    });

    it('should provide default description when none specified', () => {
      const methodInfo = createMethodInfo({
        httpMethod: 'GET',
        path: '/users',
        methodName: 'getUsers',
        responses: [
          {
            statusCode: 200,
            description: Option.none(),
            type: Option.some('UserDto'),
            isArray: false,
          },
        ],
      });

      const result = transformMethod(methodInfo);
      const operation = result['/users'].get;

      expect(operation.responses['200'].description).toBe('');
    });

    it('should include default success response when @ApiResponse only covers error codes', () => {
      // This matches NestJS Swagger behavior: if @ApiResponse only defines error responses,
      // the default success response (from return type) should also be included
      const methodInfo = createMethodInfo({
        httpMethod: 'POST',
        path: '/policies',
        methodName: 'createPolicy',
        returnType: {
          type: Option.some('PolicyDto'),
          inline: Option.none(),
          container: Option.none(),
          filePath: Option.none(),
        },
        responses: [
          {
            statusCode: 409,
            description: Option.some('Policy already exists'),
            type: Option.some('ConflictError'),
            isArray: false,
          },
        ],
      });

      const result = transformMethod(methodInfo);
      const operation = result['/policies'].post;

      // Should have both 201 (default for POST) and 409 (from @ApiResponse)
      expect(operation.responses).toHaveProperty('201');
      expect(operation.responses).toHaveProperty('409');

      // 201 should use return type schema
      expect(operation.responses['201'].content).toBeDefined();
      expect(
        operation.responses['201'].content?.['application/json'].schema,
      ).toEqual({
        $ref: '#/components/schemas/PolicyDto',
      });

      // 409 should use @ApiResponse type
      expect(operation.responses['409'].description).toBe(
        'Policy already exists',
      );
      expect(
        operation.responses['409'].content?.['application/json'].schema,
      ).toEqual({
        $ref: '#/components/schemas/ConflictError',
      });
    });

    it('should NOT add default success response when @ApiResponse already covers success codes', () => {
      const methodInfo = createMethodInfo({
        httpMethod: 'POST',
        path: '/users',
        methodName: 'createUser',
        returnType: {
          type: Option.some('UserDto'),
          inline: Option.none(),
          container: Option.none(),
          filePath: Option.none(),
        },
        responses: [
          {
            statusCode: 201,
            description: Option.some('User created'),
            type: Option.some('UserDto'),
            isArray: false,
          },
          {
            statusCode: 400,
            description: Option.some('Invalid input'),
            type: Option.none(),
            isArray: false,
          },
        ],
      });

      const result = transformMethod(methodInfo);
      const operation = result['/users'].post;

      // Should only have the responses from @ApiResponse, not a duplicate 201
      expect(Object.keys(operation.responses).sort()).toEqual(['201', '400']);
      expect(operation.responses['201'].description).toBe('User created');
    });
  });

  describe('Content types', () => {
    it('should use default application/json for request body when no @ApiConsumes', () => {
      const methodInfo = createMethodInfo({
        httpMethod: 'POST',
        path: '/users',
        methodName: 'createUser',
        parameters: [
          {
            name: 'body',
            location: 'body',
            tsType: 'CreateUserDto',
            required: true,
            description: Option.none(),
          },
        ],
        consumes: [],
      });

      const result = transformMethod(methodInfo);
      const operation = result['/users'].post;

      expect(operation.requestBody?.content).toHaveProperty('application/json');
    });

    it('should use @ApiConsumes content type for request body', () => {
      const methodInfo = createMethodInfo({
        httpMethod: 'POST',
        path: '/files',
        methodName: 'uploadFile',
        parameters: [
          {
            name: 'file',
            location: 'body',
            tsType: 'FileDto',
            required: true,
            description: Option.none(),
          },
        ],
        consumes: ['multipart/form-data'],
      });

      const result = transformMethod(methodInfo);
      const operation = result['/files'].post;

      expect(operation.requestBody?.content).toHaveProperty(
        'multipart/form-data',
      );
      expect(operation.requestBody?.content).not.toHaveProperty(
        'application/json',
      );
    });

    it('should use multiple @ApiConsumes content types for request body', () => {
      const methodInfo = createMethodInfo({
        httpMethod: 'POST',
        path: '/data',
        methodName: 'createData',
        parameters: [
          {
            name: 'data',
            location: 'body',
            tsType: 'DataDto',
            required: true,
            description: Option.none(),
          },
        ],
        consumes: ['application/json', 'application/xml'],
      });

      const result = transformMethod(methodInfo);
      const operation = result['/data'].post;

      expect(operation.requestBody?.content).toHaveProperty('application/json');
      expect(operation.requestBody?.content).toHaveProperty('application/xml');
    });

    it('should use default application/json for responses when no @ApiProduces', () => {
      const methodInfo = createMethodInfo({
        httpMethod: 'GET',
        path: '/users',
        methodName: 'getUsers',
        produces: [],
        security: [],
      });

      const result = transformMethod(methodInfo);
      const operation = result['/users'].get;

      expect(operation.responses['200'].content).toHaveProperty(
        'application/json',
      );
    });

    it('should use @ApiProduces content type for responses', () => {
      const methodInfo = createMethodInfo({
        httpMethod: 'GET',
        path: '/reports/pdf',
        methodName: 'getPdfReport',
        produces: ['application/pdf'],
      });

      const result = transformMethod(methodInfo);
      const operation = result['/reports/pdf'].get;

      expect(operation.responses['200'].content).toHaveProperty(
        'application/pdf',
      );
      expect(operation.responses['200'].content).not.toHaveProperty(
        'application/json',
      );
    });

    it('should use multiple @ApiProduces content types for responses', () => {
      const methodInfo = createMethodInfo({
        httpMethod: 'GET',
        path: '/export',
        methodName: 'exportData',
        produces: ['application/json', 'text/csv', 'application/xml'],
      });

      const result = transformMethod(methodInfo);
      const operation = result['/export'].get;

      expect(operation.responses['200'].content).toHaveProperty(
        'application/json',
      );
      expect(operation.responses['200'].content).toHaveProperty('text/csv');
      expect(operation.responses['200'].content).toHaveProperty(
        'application/xml',
      );
    });

    it('should use @ApiProduces content types for @ApiResponse decorators', () => {
      const methodInfo = createMethodInfo({
        httpMethod: 'GET',
        path: '/users/{id}',
        methodName: 'getUser',
        produces: ['application/json', 'application/xml'],
        responses: [
          {
            statusCode: 200,
            description: Option.some('User found'),
            type: Option.some('UserDto'),
            isArray: false,
          },
        ],
      });

      const result = transformMethod(methodInfo);
      const operation = result['/users/{id}'].get;

      expect(operation.responses['200'].content).toHaveProperty(
        'application/json',
      );
      expect(operation.responses['200'].content).toHaveProperty(
        'application/xml',
      );
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
        { tsType: 'object', expected: { type: 'object' } },
        {
          tsType: 'CustomDto',
          expected: { $ref: '#/components/schemas/CustomDto' },
        },
      ];

      testCases.forEach(({ tsType, expected }) => {
        const methodInfo: MethodInfo = {
          httpMethod: 'GET',
          path: '/test',
          methodName: 'test',
          controllerName: 'TestController',
          controllerTags: ['test'],
          returnType: {
            type: Option.some('string'),
            inline: Option.none(),
            container: Option.none(),
            filePath: Option.none(),
          },
          parameters: [
            {
              name: 'param',
              location: 'query',
              tsType,
              required: false,
              description: Option.none(),
            },
          ],
          decorators: [],
          operation: {
            summary: Option.none(),
            description: Option.none(),
            operationId: Option.none(),
            deprecated: Option.none(),
          },
          responses: [],
          httpCode: Option.none(),
          consumes: [],
          produces: [],
          security: [],
        };

        const result = transformMethod(methodInfo);
        const param = result['/test'].get.parameters?.[0];

        expect(param?.schema).toEqual(expected);
      });
    });

    it('should handle union types', () => {
      const methodInfo: MethodInfo = {
        httpMethod: 'GET',
        path: '/test',
        methodName: 'test',
        controllerName: 'TestController',
        controllerTags: ['test'],
        returnType: {
          type: Option.some('string'),
          inline: Option.none(),
          container: Option.none(),
          filePath: Option.none(),
        },
        parameters: [
          {
            name: 'param',
            location: 'query',
            tsType: 'string | number',
            required: false,
            description: Option.none(),
          },
        ],
        decorators: [],
        operation: {
          summary: Option.none(),
          description: Option.none(),
          operationId: Option.none(),
          deprecated: Option.none(),
        },
        responses: [],
        httpCode: Option.none(),
        consumes: [],
        produces: [],
        security: [],
      };

      const result = transformMethod(methodInfo);
      const param = result['/test'].get.parameters?.[0];

      expect(param?.schema).toEqual({
        oneOf: [{ type: 'string' }, { type: 'number' }],
      });
    });
  });

  describe('Optional type handling (T | undefined, T | null)', () => {
    it('should strip undefined from union types instead of producing oneOf', () => {
      const testCases = [
        {
          tsType: 'string | undefined',
          expected: { type: 'string' },
        },
        {
          tsType: 'number | undefined',
          expected: { type: 'number' },
        },
        {
          tsType: 'boolean | undefined',
          expected: { type: 'boolean' },
        },
      ];

      testCases.forEach(({ tsType, expected }) => {
        const methodInfo = createMethodInfo({
          parameters: [
            {
              name: 'param',
              location: 'query',
              tsType,
              required: false,
              description: Option.none(),
            },
          ],
        });

        const result = transformMethod(methodInfo);
        const param = result['/test'].get.parameters?.[0];

        expect(param?.schema).toEqual(expected);
      });
    });

    it('should strip undefined from return type unions', () => {
      const methodInfo = createMethodInfo({
        returnType: {
          type: Option.some('UserDto | undefined'),
          inline: Option.none(),
          container: Option.none(),
          filePath: Option.none(),
        },
      });

      const result = transformMethod(methodInfo);
      const schema =
        result['/test'].get.responses['200']?.content?.['application/json']
          ?.schema;

      expect(schema).toEqual({
        $ref: '#/components/schemas/UserDto',
      });
    });

    it('should handle T | null as nullable', () => {
      const methodInfo = createMethodInfo({
        parameters: [
          {
            name: 'param',
            location: 'query',
            tsType: 'string | null',
            required: false,
            description: Option.none(),
          },
        ],
      });

      const result = transformMethod(methodInfo);
      const param = result['/test'].get.parameters?.[0];

      expect(param?.schema).toEqual({ type: 'string', nullable: true });
    });

    it('should handle T | null | undefined as nullable', () => {
      const methodInfo = createMethodInfo({
        parameters: [
          {
            name: 'param',
            location: 'query',
            tsType: 'string | null | undefined',
            required: false,
            description: Option.none(),
          },
        ],
      });

      const result = transformMethod(methodInfo);
      const param = result['/test'].get.parameters?.[0];

      expect(param?.schema).toEqual({ type: 'string', nullable: true });
    });

    it('should handle $ref | null by wrapping in allOf', () => {
      const methodInfo = createMethodInfo({
        returnType: {
          type: Option.some('UserDto | null'),
          inline: Option.none(),
          container: Option.none(),
          filePath: Option.none(),
        },
      });

      const result = transformMethod(methodInfo);
      const schema =
        result['/test'].get.responses['200']?.content?.['application/json']
          ?.schema;

      expect(schema).toEqual({
        allOf: [{ $ref: '#/components/schemas/UserDto' }],
        nullable: true,
      });
    });

    it('should handle multi-member union | null as nullable oneOf', () => {
      const methodInfo = createMethodInfo({
        parameters: [
          {
            name: 'param',
            location: 'query',
            tsType: 'string | number | null',
            required: false,
            description: Option.none(),
          },
        ],
      });

      const result = transformMethod(methodInfo);
      const param = result['/test'].get.parameters?.[0];

      expect(param?.schema).toEqual({
        oneOf: [{ type: 'string' }, { type: 'number' }],
        nullable: true,
      });
    });

    it('should preserve real unions that are not just T | undefined', () => {
      const methodInfo = createMethodInfo({
        parameters: [
          {
            name: 'param',
            location: 'query',
            tsType: 'string | number',
            required: false,
            description: Option.none(),
          },
        ],
      });

      const result = transformMethod(methodInfo);
      const param = result['/test'].get.parameters?.[0];

      expect(param?.schema).toEqual({
        oneOf: [{ type: 'string' }, { type: 'number' }],
      });
    });
  });

  describe('Non-PascalCase class names', () => {
    it('should generate $ref for camelCase class names used as return types', () => {
      const methodInfo = createMethodInfo({
        httpMethod: 'GET',
        path: '/items',
        methodName: 'getItems',
        returnType: {
          type: Option.some('myResponseDto'),
          inline: Option.none(),
          container: Option.none(),
          filePath: Option.none(),
        },
      });

      const result = transformMethod(methodInfo);
      const operation = result['/items'].get;

      expect(operation.responses).toMatchObject({
        '200': {
          description: '',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/myResponseDto',
              },
            },
          },
        },
      });
    });

    it('should generate array of $ref for camelCase class names', () => {
      const methodInfo = createMethodInfo({
        httpMethod: 'GET',
        path: '/items',
        methodName: 'getItems',
        returnType: {
          type: Option.some('myResponseDto'),
          inline: Option.none(),
          container: Option.some('array'),
          filePath: Option.none(),
        },
      });

      const result = transformMethod(methodInfo);
      const operation = result['/items'].get;

      expect(operation.responses).toMatchObject({
        '200': {
          description: '',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: {
                  $ref: '#/components/schemas/myResponseDto',
                },
              },
            },
          },
        },
      });
    });

    it('should generate $ref for camelCase type in parameter schema', () => {
      const methodInfo = createMethodInfo({
        parameters: [
          {
            name: 'body',
            location: 'body',
            tsType: 'myResponseDto',
            required: true,
            description: Option.none(),
          },
        ],
      });

      const result = transformMethod(methodInfo);
      const operation = result['/test'].get;

      expect(operation.requestBody).toMatchObject({
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/myResponseDto',
            },
          },
        },
      });
    });
  });

  describe('Primitive type @ApiBody handling', () => {
    it('should handle @ApiBody with primitive string type', () => {
      const methodInfo = createMethodInfo({
        httpMethod: 'POST',
        path: '/echo',
        methodName: 'echo',
        parameters: [
          {
            name: 'message',
            location: 'body',
            tsType: 'string',
            required: true,
            description: Option.some('Message to echo'),
          },
        ],
        consumes: ['text/plain'],
      });

      const result = transformMethod(methodInfo);
      const operation = result['/echo'].post;

      expect(operation.requestBody?.content).toHaveProperty('text/plain');
      expect(operation.requestBody?.content?.['text/plain'].schema).toEqual({
        type: 'string',
      });
    });

    it('should handle @ApiBody with primitive number type', () => {
      const methodInfo = createMethodInfo({
        httpMethod: 'POST',
        path: '/calculate',
        methodName: 'calculate',
        parameters: [
          {
            name: 'value',
            location: 'body',
            tsType: 'number',
            required: true,
            description: Option.none(),
          },
        ],
      });

      const result = transformMethod(methodInfo);
      const operation = result['/calculate'].post;

      expect(
        operation.requestBody?.content?.['application/json'].schema,
      ).toEqual({
        type: 'number',
      });
    });

    it('should handle @ApiBody with primitive boolean type', () => {
      const methodInfo = createMethodInfo({
        httpMethod: 'POST',
        path: '/toggle',
        methodName: 'toggle',
        parameters: [
          {
            name: 'enabled',
            location: 'body',
            tsType: 'boolean',
            required: true,
            description: Option.none(),
          },
        ],
      });

      const result = transformMethod(methodInfo);
      const operation = result['/toggle'].post;

      expect(
        operation.requestBody?.content?.['application/json'].schema,
      ).toEqual({
        type: 'boolean',
      });
    });
  });

  describe('Inline return type handling', () => {
    it('should parse inline object type and extract properties', () => {
      const methodInfo = createMethodInfo({
        httpMethod: 'GET',
        path: '/user',
        methodName: 'getUser',
        returnType: {
          type: Option.none(),
          inline: Option.some('{ name: string; email: string }'),
          container: Option.none(),
          filePath: Option.none(),
        },
      });

      const result = transformMethod(methodInfo);
      const schema =
        result['/user'].get.responses['200'].content?.['application/json']
          .schema;

      expect(schema).toEqual({
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string' },
        },
        required: ['name', 'email'],
      });
    });

    it('should handle optional properties in inline types', () => {
      const methodInfo = createMethodInfo({
        httpMethod: 'GET',
        path: '/profile',
        methodName: 'getProfile',
        returnType: {
          type: Option.none(),
          inline: Option.some('{ name: string; age?: number }'),
          container: Option.none(),
          filePath: Option.none(),
        },
      });

      const result = transformMethod(methodInfo);
      const schema =
        result['/profile'].get.responses['200'].content?.['application/json']
          .schema;

      expect(schema).toEqual({
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      });
    });

    it('should handle array of inline objects', () => {
      const methodInfo = createMethodInfo({
        httpMethod: 'GET',
        path: '/users',
        methodName: 'getUsers',
        returnType: {
          type: Option.none(),
          inline: Option.some('{ id: number; name: string }'),
          container: Option.some('array'),
          filePath: Option.none(),
        },
      });

      const result = transformMethod(methodInfo);
      const schema =
        result['/users'].get.responses['200'].content?.['application/json']
          .schema;

      expect(schema).toEqual({
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            name: { type: 'string' },
          },
          required: ['id', 'name'],
        },
      });
    });

    it('should handle nested inline types', () => {
      const methodInfo = createMethodInfo({
        httpMethod: 'GET',
        path: '/nested',
        methodName: 'getNested',
        returnType: {
          type: Option.none(),
          inline: Option.some('{ data: { value: string } }'),
          container: Option.none(),
          filePath: Option.none(),
        },
      });

      const result = transformMethod(methodInfo);
      const schema =
        result['/nested'].get.responses['200'].content?.['application/json']
          .schema;

      expect(schema).toEqual({
        type: 'object',
        properties: {
          data: {
            type: 'object',
            properties: {
              value: { type: 'string' },
            },
            required: ['value'],
          },
        },
        required: ['data'],
      });
    });

    it('should handle empty inline object', () => {
      const methodInfo = createMethodInfo({
        httpMethod: 'GET',
        path: '/empty',
        methodName: 'getEmpty',
        returnType: {
          type: Option.none(),
          inline: Option.some('{}'),
          container: Option.none(),
          filePath: Option.none(),
        },
      });

      const result = transformMethod(methodInfo);
      const schema =
        result['/empty'].get.responses['200'].content?.['application/json']
          .schema;

      expect(schema).toEqual({
        type: 'object',
        properties: {},
      });
    });
  });
});
