import { describe, it, expect } from 'vitest';
import { Option } from 'effect';
import { Project } from 'ts-morph';
import {
  isModuleClass,
  getModuleDecoratorArg,
  resolveClassFromExpression,
  resolveArrayOfClasses,
  getModuleMetadata,
} from './nest-ast.js';

describe('NestJS AST Utilities', () => {
  const createProject = () =>
    new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        strict: true,
        experimentalDecorators: true,
      },
    });

  describe('isModuleClass', () => {
    it('should return true for class with @Module decorator', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
          function Module(options: any): ClassDecorator { return () => {}; }
          
          @Module({})
          class AppModule {}
        `,
      );

      const classDecl = sourceFile.getClass('AppModule');
      expect(isModuleClass(classDecl)).toBe(true);
    });

    it('should return false for class without @Module decorator', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
          class UserService {}
        `,
      );

      const classDecl = sourceFile.getClass('UserService');
      expect(isModuleClass(classDecl)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isModuleClass(undefined)).toBe(false);
    });
  });

  describe('getModuleDecoratorArg', () => {
    it('should get module decorator argument', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
          function Module(options: any): ClassDecorator { return () => {}; }
          
          @Module({
            controllers: [],
            providers: []
          })
          class AppModule {}
        `,
      );

      const classDecl = sourceFile.getClass('AppModule')!;
      const result = getModuleDecoratorArg(classDecl);

      expect(Option.isSome(result)).toBe(true);
    });

    it('should return None for class without @Module', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
          class UserService {}
        `,
      );

      const classDecl = sourceFile.getClass('UserService')!;
      const result = getModuleDecoratorArg(classDecl);

      expect(Option.isNone(result)).toBe(true);
    });
  });

  describe('resolveClassFromExpression', () => {
    it('should resolve class from identifier', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
          class UserController {}
          const ref = UserController;
        `,
      );

      const varDecl = sourceFile.getVariableDeclaration('ref');
      const initializer = varDecl?.getInitializer();

      const result = resolveClassFromExpression(initializer);

      expect(Option.isSome(result)).toBe(true);
      expect(Option.getOrNull(result)?.getName()).toBe('UserController');
    });

    it('should return None for undefined', () => {
      const result = resolveClassFromExpression(undefined);
      expect(Option.isNone(result)).toBe(true);
    });

    it('should return None for non-class expressions', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
          const num = 42;
        `,
      );

      const varDecl = sourceFile.getVariableDeclaration('num');
      const initializer = varDecl?.getInitializer();

      const result = resolveClassFromExpression(initializer);

      expect(Option.isNone(result)).toBe(true);
    });
  });

  describe('resolveArrayOfClasses', () => {
    it('should resolve array of class references', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
          class UserController {}
          class ProductController {}
          const arr = [UserController, ProductController];
        `,
      );

      const varDecl = sourceFile.getVariableDeclaration('arr');
      const initializer = varDecl?.getInitializer();

      const result = resolveArrayOfClasses(initializer);

      expect(result).toHaveLength(2);
      expect(result.map((c) => c.getName())).toEqual([
        'UserController',
        'ProductController',
      ]);
    });

    it('should return empty array for undefined', () => {
      const result = resolveArrayOfClasses(undefined);
      expect(result).toEqual([]);
    });

    it('should return empty array for non-array expression', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
          const notArray = 42;
        `,
      );

      const varDecl = sourceFile.getVariableDeclaration('notArray');
      const initializer = varDecl?.getInitializer();

      const result = resolveArrayOfClasses(initializer);

      expect(result).toEqual([]);
    });

    it('should skip spread elements', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
          class UserController {}
          const others: any[] = [];
          const arr = [UserController, ...others];
        `,
      );

      const varDecl = sourceFile.getVariableDeclaration('arr');
      const initializer = varDecl?.getInitializer();

      const result = resolveArrayOfClasses(initializer);

      expect(result).toHaveLength(1);
      expect(result[0].getName()).toBe('UserController');
    });
  });

  describe('getModuleMetadata', () => {
    it('should extract controllers from module', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
          function Module(options: any): ClassDecorator { return () => {}; }
          function Controller(path?: string): ClassDecorator { return () => {}; }
          
          @Controller('/users')
          class UserController {}
          
          @Module({
            controllers: [UserController]
          })
          class UserModule {}
        `,
      );

      const moduleClass = sourceFile.getClass('UserModule')!;
      const metadata = getModuleMetadata(moduleClass);

      expect(metadata.controllers).toHaveLength(1);
      expect(metadata.controllers[0].getName()).toBe('UserController');
    });

    it('should return empty arrays for class without @Module', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
          class NotAModule {}
        `,
      );

      const classDecl = sourceFile.getClass('NotAModule')!;
      const metadata = getModuleMetadata(classDecl);

      expect(metadata.controllers).toEqual([]);
      expect(metadata.imports).toEqual([]);
    });

    it('should extract imports from module', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
          function Module(options: any): ClassDecorator { return () => {}; }
          
          @Module({})
          class SharedModule {}
          
          @Module({
            imports: [SharedModule]
          })
          class AppModule {}
        `,
      );

      const moduleClass = sourceFile.getClass('AppModule')!;
      const metadata = getModuleMetadata(moduleClass);

      expect(metadata.imports).toHaveLength(1);
      expect(metadata.imports[0].getName()).toBe('SharedModule');
    });
  });
});
