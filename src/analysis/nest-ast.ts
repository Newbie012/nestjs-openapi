import { Option } from 'effect';
import type {
  ClassDeclaration,
  Decorator,
  Expression,
  ObjectLiteralExpression,
  Symbol,
} from 'ts-morph';
import { ts } from 'ts-morph';
import {
  resolveClassFromSymbol,
  getArrayInitializer,
  getSymbolFromIdentifier,
} from './ast.js';

const moduleDecoratorCache = new WeakMap<ClassDeclaration, Decorator | null>();
const moduleMetadataCache = new WeakMap<ClassDeclaration, ModuleMetadata>();
const classFromExpressionCache = new WeakMap<
  Expression,
  ClassDeclaration | null
>();

const getModuleDecorator = (cls: ClassDeclaration): Decorator | undefined => {
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

  const symbol = Option.getOrUndefined(getSymbolFromIdentifier(expr));
  if (symbol) {
    const resolved = resolveClassFromSymbol(symbol);
    classFromExpressionCache.set(
      expr,
      Option.isSome(resolved) ? resolved.value : null,
    );
    return resolved;
  }

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

const MAX_ARRAY_DEPTH = 16;

interface ArrayElements {
  readonly classes: ClassDeclaration[];
  readonly unresolved: string[];
}

const unwrapExpression = (expr: Expression): Expression => {
  const inner =
    expr.asKind(ts.SyntaxKind.ParenthesizedExpression) ??
    expr.asKind(ts.SyntaxKind.AsExpression) ??
    expr.asKind(ts.SyntaxKind.SatisfiesExpression) ??
    expr.asKind(ts.SyntaxKind.NonNullExpression) ??
    expr.asKind(ts.SyntaxKind.TypeAssertionExpression);
  return inner ? unwrapExpression(inner.getExpression()) : expr;
};

const initializerOfIdentifier = (id: Expression): Expression | undefined => {
  const symbol = Option.getOrUndefined(getSymbolFromIdentifier(id));
  if (!symbol) return undefined;
  const target =
    (symbol as { getAliasedSymbol?: () => Symbol }).getAliasedSymbol?.() ??
    symbol;
  return target
    .getDeclarations()
    .flatMap((declaration) => {
      const variable = declaration.asKind(ts.SyntaxKind.VariableDeclaration);
      return variable ? [variable.getInitializer()] : [];
    })
    .find((init): init is Expression => init !== undefined);
};

const collectArrayElements = (
  expr: Expression,
  out: ArrayElements,
  depth: number,
): void => {
  if (depth > MAX_ARRAY_DEPTH) {
    out.unresolved.push(expr.getText());
    return;
  }
  const unwrapped = unwrapExpression(expr);
  const arr = unwrapped.asKind(ts.SyntaxKind.ArrayLiteralExpression);
  if (arr) {
    for (const element of arr.getElements()) {
      const spread = element.asKind(ts.SyntaxKind.SpreadElement);
      if (spread) {
        collectArrayElements(spread.getExpression(), out, depth + 1);
        continue;
      }
      const candidate = resolveClassFromExpression(element);
      if (Option.isSome(candidate)) {
        out.classes.push(candidate.value);
      } else {
        out.unresolved.push(element.getText());
      }
    }
    return;
  }

  const id = unwrapped.asKind(ts.SyntaxKind.Identifier);
  const initializer = id ? initializerOfIdentifier(id) : undefined;
  if (initializer) {
    collectArrayElements(initializer, out, depth + 1);
    return;
  }
  out.unresolved.push(expr.getText());
};

const resolveArrayElements = (propInit?: Expression): ArrayElements => {
  const out: ArrayElements = { classes: [], unresolved: [] };
  if (propInit) collectArrayElements(propInit, out, 0);
  return out;
};

/**
 * Classes listed in an array expression. Follows spreads and identifiers that
 * point to array literals, across imports; anything computed at runtime is skipped
 */
export const resolveArrayOfClasses = (
  propInit?: Expression,
): readonly ClassDeclaration[] => resolveArrayElements(propInit).classes;

export interface ModuleMetadata {
  readonly controllers: readonly ClassDeclaration[];
  readonly imports: readonly ClassDeclaration[];
  /** Source text of listed entries that could not be resolved statically */
  readonly unresolved?: readonly string[];
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

  const resolvedControllers = resolveArrayElements(controllersInit);
  const resolvedImports = resolveArrayElements(importsInit);

  const controllers = resolvedControllers.classes.filter(
    (cls) => cls.getName() !== undefined,
  );

  const metadata = {
    controllers,
    imports: resolvedImports.classes,
    unresolved: [
      ...resolvedControllers.unresolved,
      ...resolvedImports.unresolved,
    ],
  };
  moduleMetadataCache.set(mod, metadata);
  return metadata;
};
