import { Option } from 'effect';
import type {
  ClassDeclaration,
  Expression,
  ObjectLiteralExpression,
  Symbol,
} from 'ts-morph';
import { ts } from 'ts-morph';

const classFromSymbolCache = new WeakMap<Symbol, ClassDeclaration | null>();
const symbolFromIdentifierCache = new WeakMap<Expression, Symbol | null>();

/** Handles aliased symbols (re-exports) */
export const resolveClassFromSymbol = (
  sym: Symbol,
): Option.Option<ClassDeclaration> => {
  const cached = classFromSymbolCache.get(sym);
  if (cached !== undefined) {
    return Option.fromNullable(cached);
  }

  const target =
    (sym as { getAliasedSymbol?: () => Symbol }).getAliasedSymbol?.() ?? sym;
  const targetCached = classFromSymbolCache.get(target);
  if (targetCached !== undefined) {
    classFromSymbolCache.set(sym, targetCached);
    return Option.fromNullable(targetCached);
  }

  const declarations = target.getDeclarations() ?? [];
  const classDecl = declarations.find(
    (d): d is ClassDeclaration =>
      d.getKind?.() === ts.SyntaxKind.ClassDeclaration,
  );
  classFromSymbolCache.set(target, classDecl ?? null);
  classFromSymbolCache.set(sym, classDecl ?? null);
  return Option.fromNullable(classDecl);
};

export const getArrayInitializer = (
  objectLiteral: ObjectLiteralExpression,
  propertyName: string,
): Option.Option<Expression> => {
  const initializer = objectLiteral
    .getProperty(propertyName)
    ?.asKind(ts.SyntaxKind.PropertyAssignment)
    ?.getInitializer();

  return Option.fromNullable(initializer);
};

export const getStringLiteralValue = (
  expr: Expression | undefined,
): Option.Option<string> => {
  if (!expr) return Option.none();
  const stringLit = expr.asKind?.(ts.SyntaxKind.StringLiteral);
  return Option.fromNullable(stringLit?.getLiteralValue());
};

export const getSymbolFromIdentifier = (
  expr: Expression | undefined,
): Option.Option<Symbol> => {
  if (!expr) return Option.none();

  const cached = symbolFromIdentifierCache.get(expr);
  if (cached !== undefined) {
    return Option.fromNullable(cached);
  }

  const id = expr.asKind?.(ts.SyntaxKind.Identifier);
  const symbol = id?.getSymbol() ?? id?.getDefinitionNodes()[0]?.getSymbol();
  symbolFromIdentifierCache.set(expr, symbol ?? null);
  return Option.fromNullable(symbol);
};
