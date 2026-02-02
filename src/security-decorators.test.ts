import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import {
  extractControllerSecurity,
  extractMethodSecurity,
  hasMethodSecurityDecorators,
  combineSecurityRequirements,
} from './security-decorators.js';

const createProject = () =>
  new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { strict: true },
  });

describe('security-decorators', () => {
  describe('extractControllerSecurity', () => {
    it('should extract @ApiBearerAuth with default name', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        '/test.ts',
        `
        @ApiBearerAuth()
        @Controller('users')
        export class UsersController {}
      `,
      );
      const controller = sourceFile.getClassOrThrow('UsersController');

      const security = extractControllerSecurity(controller);

      expect(security).toEqual([{ schemeName: 'bearer', scopes: [] }]);
    });

    it('should extract @ApiBearerAuth with custom name', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        '/test.ts',
        `
        @ApiBearerAuth('jwt')
        @Controller('users')
        export class UsersController {}
      `,
      );
      const controller = sourceFile.getClassOrThrow('UsersController');

      const security = extractControllerSecurity(controller);

      expect(security).toEqual([{ schemeName: 'jwt', scopes: [] }]);
    });

    it('should extract @ApiBasicAuth with default name', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        '/test.ts',
        `
        @ApiBasicAuth()
        @Controller('auth')
        export class AuthController {}
      `,
      );
      const controller = sourceFile.getClassOrThrow('AuthController');

      const security = extractControllerSecurity(controller);

      expect(security).toEqual([{ schemeName: 'basic', scopes: [] }]);
    });

    it('should extract @ApiOAuth2 with scopes', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        '/test.ts',
        `
        @ApiOAuth2(['read:users', 'write:users'])
        @Controller('users')
        export class UsersController {}
      `,
      );
      const controller = sourceFile.getClassOrThrow('UsersController');

      const security = extractControllerSecurity(controller);

      expect(security).toEqual([
        { schemeName: 'oauth2', scopes: ['read:users', 'write:users'] },
      ]);
    });

    it('should extract @ApiOAuth2 with custom name', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        '/test.ts',
        `
        @ApiOAuth2(['read'], 'my-oauth')
        @Controller('users')
        export class UsersController {}
      `,
      );
      const controller = sourceFile.getClassOrThrow('UsersController');

      const security = extractControllerSecurity(controller);

      expect(security).toEqual([{ schemeName: 'my-oauth', scopes: ['read'] }]);
    });

    it('should extract @ApiSecurity with name', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        '/test.ts',
        `
        @ApiSecurity('api-key')
        @Controller('admin')
        export class AdminController {}
      `,
      );
      const controller = sourceFile.getClassOrThrow('AdminController');

      const security = extractControllerSecurity(controller);

      expect(security).toEqual([{ schemeName: 'api-key', scopes: [] }]);
    });

    it('should extract @ApiCookieAuth with default name', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        '/test.ts',
        `
        @ApiCookieAuth()
        @Controller('session')
        export class SessionController {}
      `,
      );
      const controller = sourceFile.getClassOrThrow('SessionController');

      const security = extractControllerSecurity(controller);

      expect(security).toEqual([{ schemeName: 'cookie', scopes: [] }]);
    });

    it('should extract multiple security decorators', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        '/test.ts',
        `
        @ApiBearerAuth('jwt')
        @ApiSecurity('admin-key')
        @Controller('admin')
        export class AdminController {}
      `,
      );
      const controller = sourceFile.getClassOrThrow('AdminController');

      const security = extractControllerSecurity(controller);

      expect(security).toEqual([
        { schemeName: 'jwt', scopes: [] },
        { schemeName: 'admin-key', scopes: [] },
      ]);
    });

    it('should return empty array when no security decorators', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        '/test.ts',
        `
        @Controller('public')
        export class PublicController {}
      `,
      );
      const controller = sourceFile.getClassOrThrow('PublicController');

      const security = extractControllerSecurity(controller);

      expect(security).toEqual([]);
    });
  });

  describe('extractMethodSecurity', () => {
    it('should extract security from method', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        '/test.ts',
        `
        class TestController {
          @ApiBearerAuth()
          @Get()
          findAll() {}
        }
      `,
      );
      const controller = sourceFile.getClassOrThrow('TestController');
      const method = controller.getMethodOrThrow('findAll');

      const security = extractMethodSecurity(method);

      expect(security).toEqual([{ schemeName: 'bearer', scopes: [] }]);
    });

    it('should return empty array when no security decorators on method', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        '/test.ts',
        `
        class TestController {
          @Get()
          findAll() {}
        }
      `,
      );
      const controller = sourceFile.getClassOrThrow('TestController');
      const method = controller.getMethodOrThrow('findAll');

      const security = extractMethodSecurity(method);

      expect(security).toEqual([]);
    });
  });

  describe('hasMethodSecurityDecorators', () => {
    it('should return true when method has security decorators', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        '/test.ts',
        `
        class TestController {
          @ApiBearerAuth()
          @Get()
          findAll() {}
        }
      `,
      );
      const controller = sourceFile.getClassOrThrow('TestController');
      const method = controller.getMethodOrThrow('findAll');

      expect(hasMethodSecurityDecorators(method)).toBe(true);
    });

    it('should return false when method has no security decorators', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        '/test.ts',
        `
        class TestController {
          @Get()
          @ApiOperation({ summary: 'Find all' })
          findAll() {}
        }
      `,
      );
      const controller = sourceFile.getClassOrThrow('TestController');
      const method = controller.getMethodOrThrow('findAll');

      expect(hasMethodSecurityDecorators(method)).toBe(false);
    });
  });

  describe('combineSecurityRequirements', () => {
    it('should use method security when method has decorators', () => {
      const controllerSecurity = [{ schemeName: 'bearer', scopes: [] }];
      const methodSecurity = [{ schemeName: 'api-key', scopes: [] }];

      const combined = combineSecurityRequirements(
        controllerSecurity,
        methodSecurity,
        true,
      );

      expect(combined).toEqual([{ schemeName: 'api-key', scopes: [] }]);
    });

    it('should use controller security when method has no decorators', () => {
      const controllerSecurity = [{ schemeName: 'bearer', scopes: [] }];
      const methodSecurity: { schemeName: string; scopes: string[] }[] = [];

      const combined = combineSecurityRequirements(
        controllerSecurity,
        methodSecurity,
        false,
      );

      expect(combined).toEqual([{ schemeName: 'bearer', scopes: [] }]);
    });

    it('should return empty array when neither has security', () => {
      const combined = combineSecurityRequirements([], [], false);

      expect(combined).toEqual([]);
    });
  });
});
