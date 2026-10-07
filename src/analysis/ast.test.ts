import { describe, it, expect } from 'vitest';
import { Option } from 'effect';
import { Project, ts } from 'ts-morph';
import {
  resolveClassFromSymbol,
  getArrayInitializer,
  getStringLiteralValue,
  getSymbolFromIdentifier,
} from './ast.js';

describe('AST Utilities', () => {
  const createProject = () =>
    new Project({
      useInMemoryFileSystem: true,
      compilerOptions: { strict: true },
    });

  describe('resolveClassFromSymbol', () => {
    it('should resolve class from symbol', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
          class UserDto {
            name: string;
          }
          const ref = UserDto;
        `,
      );

      const varDecl = sourceFile.getVariableDeclaration('ref');
      const initializer = varDecl?.getInitializer();
      const symbol = initializer?.getSymbol();

      expect(symbol).toBeDefined();
      const result = resolveClassFromSymbol(symbol!);

      expect(Option.isSome(result)).toBe(true);
      expect(Option.getOrNull(result)?.getName()).toBe('UserDto');
    });

    it('should return None for non-class symbols', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
          const value = 42;
          const ref = value;
        `,
      );

      const varDecl = sourceFile.getVariableDeclaration('ref');
      const initializer = varDecl?.getInitializer();
      const symbol = initializer?.getSymbol();

      // The symbol may still resolve, but not to a class
      if (symbol) {
        const result = resolveClassFromSymbol(symbol);
        expect(Option.isNone(result)).toBe(true);
      }
    });
  });

  describe('getArrayInitializer', () => {
    it('should get array initializer from object literal', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
          const obj = {
            items: [1, 2, 3],
            name: 'test'
          };
        `,
      );

      const varDecl = sourceFile.getVariableDeclaration('obj');
      const objLit = varDecl
        ?.getInitializer()
        ?.asKind(ts.SyntaxKind.ObjectLiteralExpression);

      expect(objLit).toBeDefined();
      const result = getArrayInitializer(objLit!, 'items');

      expect(Option.isSome(result)).toBe(true);
    });

    it('should return None for missing property', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
          const obj = {
            name: 'test'
          };
        `,
      );

      const varDecl = sourceFile.getVariableDeclaration('obj');
      const objLit = varDecl
        ?.getInitializer()
        ?.asKind(ts.SyntaxKind.ObjectLiteralExpression);

      expect(objLit).toBeDefined();
      const result = getArrayInitializer(objLit!, 'items');

      expect(Option.isNone(result)).toBe(true);
    });
  });

  describe('getStringLiteralValue', () => {
    it('should extract string literal value', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
          const str = "hello world";
        `,
      );

      const varDecl = sourceFile.getVariableDeclaration('str');
      const initializer = varDecl?.getInitializer();

      const result = getStringLiteralValue(initializer);

      expect(Option.isSome(result)).toBe(true);
      expect(Option.getOrNull(result)).toBe('hello world');
    });

    it('should return None for non-string expressions', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
          const num = 42;
        `,
      );

      const varDecl = sourceFile.getVariableDeclaration('num');
      const initializer = varDecl?.getInitializer();

      const result = getStringLiteralValue(initializer);

      expect(Option.isNone(result)).toBe(true);
    });

    it('should return None for undefined expression', () => {
      const result = getStringLiteralValue(undefined);

      expect(Option.isNone(result)).toBe(true);
    });
  });

  describe('getSymbolFromIdentifier', () => {
    it('should get symbol from identifier', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
          class MyClass {}
          const ref = MyClass;
        `,
      );

      const varDecl = sourceFile.getVariableDeclaration('ref');
      const initializer = varDecl?.getInitializer();

      const result = getSymbolFromIdentifier(initializer);

      expect(Option.isSome(result)).toBe(true);
    });

    it('should return None for non-identifier expressions', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        `
          const num = 42;
        `,
      );

      const varDecl = sourceFile.getVariableDeclaration('num');
      const initializer = varDecl?.getInitializer();

      const result = getSymbolFromIdentifier(initializer);

      expect(Option.isNone(result)).toBe(true);
    });

    it('should return None for undefined expression', () => {
      const result = getSymbolFromIdentifier(undefined);

      expect(Option.isNone(result)).toBe(true);
    });
  });
});
