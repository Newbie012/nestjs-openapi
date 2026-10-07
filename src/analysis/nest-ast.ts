import { Option } from 'effect';
import type {
  ClassDeclaration,
  Decorator,
  Expression,
  ObjectLiteralExpression,
} from 'ts-morph';
import { ts } from 'ts-morph';
import {
  resolveClassFromSymbol,
  getArrayInitializer,
  getSymbolFromIdentifier,
} from './ast.js';

const moduleDecoratorCache = new WeakMap<ClassDeclaration, Decorator | null>();
const moduleMetadataCache = new WeakMap<ClassDeclaration, ModuleMetadata>();
const classFromExpressionCache = new WeakMap<Expression, ClassDeclaration | null>();

const getModuleDecorator = (
  cls: ClassDeclaration,
): Decorator | undefined => {
  if (moduleDecoratorCache.has(cls)) {
    const cached = moduleDecoratorCache.get(cls);
    return cached === null ? undefined : cached;
  }

  const decorator = cls.getDecorators().find((d) => d.getName() === 'Module');
  moduleDecoratorCache.set(cls, decorator ?? null);
  return decorator;
};

export const isModuleClass = (cls: ClassDeclaration | undefined): boolean => {
  if (!cls) return false;
  return getModuleDecorator(cls) !== undefined;
};

export const getModuleDecoratorArg = (
  cls: ClassDeclaration,
): Option.Option<ObjectLiteralExpression> => {
  const decorator = getModuleDecorator(cls);
  const arg = decorator
    ?.getArguments()?.[0]
    ?.asKind?.(ts.SyntaxKind.ObjectLiteralExpression);
  return Option.fromNullable(arg);
};

/** Handles identifiers, forwardRef(() => Class), and property access */
export const resolveClassFromExpression = (
  expr: Expression | undefined,
): Option.Option<ClassDeclaration> => {
  if (!expr) return Option.none();

  const cached = classFromExpressionCache.get(expr);
  if (cached !== undefined) {
    return Option.fromNullable(cached);
  }

  // Try direct identifier
  const symbol = Option.getOrUndefined(getSymbolFromIdentifier(expr));
  if (symbol) {
    const resolved = resolveClassFromSymbol(symbol);
    classFromExpressionCache.set(
      expr,
      Option.isSome(resolved) ? resolved.value : null,
    );
    return resolved;
  }

  // Try forwardRef(() => SomeClass)
  const call = expr.asKind?.(ts.SyntaxKind.CallExpression);
  if (call && call.getExpression().getText().endsWith('forwardRef')) {
    const args = call.getArguments();
    if (args.length === 0) return Option.none();

    const arrow = args[0]?.asKind(ts.SyntaxKind.ArrowFunction);
    if (!arrow) return Option.none();

    const body = arrow.getBody();
    const bodyId = body.asKind?.(ts.SyntaxKind.Identifier);
    if (bodyId) {
      const resolved = resolveClassFromExpression(bodyId);
      classFromExpressionCache.set(
        expr,
        Option.isSome(resolved) ? resolved.value : null,
      );
      return resolved;
    }

    const block = body.asKind?.(ts.SyntaxKind.Block);
    const retExpr = block
      ?.getStatements()
      .find((s) => s.getKind() === ts.SyntaxKind.ReturnStatement)
      ?.asKind(ts.SyntaxKind.ReturnStatement)
      ?.getExpression();
    const resolved = resolveClassFromExpression(retExpr);
    classFromExpressionCache.set(
      expr,
      Option.isSome(resolved) ? resolved.value : null,
    );
    return resolved;
  }

  // Try property access expression
  const pae = expr.asKind?.(ts.SyntaxKind.PropertyAccessExpression);
  if (pae) {
    const resolved = resolveClassFromExpression(pae.getNameNode());
    classFromExpressionCache.set(
      expr,
      Option.isSome(resolved) ? resolved.value : null,
    );
    return resolved;
  }

  classFromExpressionCache.set(expr, null);
  return Option.none();
};

export const resolveArrayOfClasses = (
  propInit?: Expression,
): readonly ClassDeclaration[] => {
  const arr = propInit?.asKind?.(ts.SyntaxKind.ArrayLiteralExpression);
  if (!arr) return [];

  return arr.getElements().flatMap((element) => {
    if (element.isKind(ts.SyntaxKind.SpreadElement)) return [];

    const candidate = resolveClassFromExpression(
      element as unknown as Expression,
    );
    return Option.isSome(candidate) ? [candidate.value] : [];
  });
};

export interface ModuleMetadata {
  readonly controllers: readonly ClassDeclaration[];
  readonly imports: readonly ClassDeclaration[];
}

export const getModuleMetadata = (mod: ClassDeclaration): ModuleMetadata => {
  const cached = moduleMetadataCache.get(mod);
  if (cached) {
    return cached;
  }

  const modArgOpt = getModuleDecoratorArg(mod);
  if (Option.isNone(modArgOpt)) {
    const empty = { controllers: [], imports: [] } as const;
    moduleMetadataCache.set(mod, empty);
    return empty;
  }

  const obj = modArgOpt.value;

  const controllersInit =
    Option.getOrUndefined(getArrayInitializer(obj, 'controllers')) ??
    Option.getOrUndefined(getArrayInitializer(obj, 'controller'));

  const importsInit = Option.getOrUndefined(
    getArrayInitializer(obj, 'imports'),
  );

  const controllers = resolveArrayOfClasses(controllersInit).filter(
    (cls) => cls.getName() !== undefined,
  );

  // Do not eagerly check @Module here; callers can handle non-module classes.
  // This avoids duplicate decorator scans during traversal.
  const imports = resolveArrayOfClasses(importsInit);

  const metadata = { controllers, imports };
  moduleMetadataCache.set(mod, metadata);
  return metadata;
};
