import { describe, it, expect } from 'vitest';
import { Effect } from 'effect';
import { Project } from 'ts-morph';
import { getModules, getAllControllers } from './modules.js';

describe('Modules', () => {
  const createProject = () =>
    new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        strict: true,
        experimentalDecorators: true,
      },
    });

  describe('getModules', () => {
    it('should return empty array for non-module class', async () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
          class NotAModule {}
        `,
      );

      const classDecl = sourceFile.getClass('NotAModule')!;
      const result = await Effect.runPromise(getModules(classDecl));

      expect(result).toEqual([]);
    });

    it('should find controllers in a single module', async () => {
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
          class AppModule {}
        `,
      );

      const appModule = sourceFile.getClass('AppModule')!;
      const result = await Effect.runPromise(getModules(appModule));

      expect(result).toHaveLength(1);
      expect(result[0].controllers).toHaveLength(1);
      expect(result[0].controllers[0].getName()).toBe('UserController');
    });

    it('should traverse nested modules', async () => {
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
          
          @Controller('/products')
          class ProductController {}
          
          @Module({
            controllers: [ProductController]
          })
          class ProductModule {}
          
          @Module({
            imports: [UserModule, ProductModule]
          })
          class AppModule {}
        `,
      );

      const appModule = sourceFile.getClass('AppModule')!;
      const result = await Effect.runPromise(getModules(appModule));

      expect(result).toHaveLength(2);
      const controllerNames = result.flatMap((m) =>
        m.controllers.map((c) => c.getName()),
      );
      expect(controllerNames).toContain('UserController');
      expect(controllerNames).toContain('ProductController');
    });

    it('should handle circular module imports', async () => {
      const project = createProject();
      // Create two files with circular imports
      project.createSourceFile(
        'module-a.ts',
        `
          import { ModuleB } from './module-b';
          function Module(options: any): ClassDecorator { return () => {}; }
          function Controller(path?: string): ClassDecorator { return () => {}; }
          
          @Controller('/a')
          class ControllerA {}
          
          @Module({
            imports: [ModuleB],
            controllers: [ControllerA]
          })
          export class ModuleA {}
        `,
      );

      project.createSourceFile(
        'module-b.ts',
        `
          import { ModuleA } from './module-a';
          function Module(options: any): ClassDecorator { return () => {}; }
          function Controller(path?: string): ClassDecorator { return () => {}; }
          
          @Controller('/b')
          class ControllerB {}
          
          @Module({
            imports: [ModuleA],
            controllers: [ControllerB]
          })
          export class ModuleB {}
        `,
      );

      const moduleA = project.getSourceFile('module-a.ts')?.getClass('ModuleA');
      expect(moduleA).toBeDefined();

      // Should not infinite loop due to visited set
      const result = await Effect.runPromise(getModules(moduleA!));

      // The exact count depends on how imports resolve
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should skip modules without controllers', async () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
          function Module(options: any): ClassDecorator { return () => {}; }
          function Controller(path?: string): ClassDecorator { return () => {}; }
          
          @Module({
            providers: []
          })
          class CoreModule {}
          
          @Controller('/users')
          class UserController {}
          
          @Module({
            imports: [CoreModule],
            controllers: [UserController]
          })
          class AppModule {}
        `,
      );

      const appModule = sourceFile.getClass('AppModule')!;
      const result = await Effect.runPromise(getModules(appModule));

      // CoreModule has no controllers, so only AppModule should be in results
      expect(result).toHaveLength(1);
      expect(result[0].declaration.getName()).toBe('AppModule');
    });
  });

  describe('getAllControllers', () => {
    it('should return all controllers from all modules', async () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
          function Module(options: any): ClassDecorator { return () => {}; }
          function Controller(path?: string): ClassDecorator { return () => {}; }
          
          @Controller('/users')
          class UserController {}
          
          @Controller('/products')
          class ProductController {}
          
          @Module({
            controllers: [UserController, ProductController]
          })
          class AppModule {}
        `,
      );

      const appModule = sourceFile.getClass('AppModule')!;
      const result = await Effect.runPromise(getAllControllers(appModule));

      expect(result).toHaveLength(2);
      expect(result.map((c) => c.getName())).toContain('UserController');
      expect(result.map((c) => c.getName())).toContain('ProductController');
    });

    it('should return empty array for non-module', async () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
          class NotAModule {}
        `,
      );

      const classDecl = sourceFile.getClass('NotAModule')!;
      const result = await Effect.runPromise(getAllControllers(classDecl));

      expect(result).toEqual([]);
    });
  });
});
