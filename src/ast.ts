import { Option } from 'effect';
import { readFileSync } from 'node:fs';
import type {
  ClassDeclaration,
  Expression,
  MethodDeclaration,
  ObjectLiteralExpression,
  Symbol,
  Type,
} from 'ts-morph';
import { Node, ts } from 'ts-morph';

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

export const resolveDeclarations = (node: Node): readonly Node[] => {
  const target = Node.isPropertyAccessExpression(node)
    ? node.getNameNode()
    : node;
  const symbol = target.getSymbol();
  if (!symbol) return [];
  const aliased = symbol.isAlias() ? symbol.getAliasedSymbol() : undefined;
  return (aliased ?? symbol).getDeclarations();
};

export const getCalleeName = (callee: Node) => {
  if (Node.isIdentifier(callee)) return callee.getText();
  if (Node.isPropertyAccessExpression(callee)) return callee.getName();
  return undefined;
};

export const getReturnedExpression = (fn: Node): Expression | undefined => {
  if (
    !Node.isFunctionDeclaration(fn) &&
    !Node.isArrowFunction(fn) &&
    !Node.isFunctionExpression(fn)
  ) {
    return undefined;
  }
  const body = fn.getBody();
  if (!body) return undefined;
  if (Node.isExpression(body)) return body;
  if (!Node.isBlock(body)) return undefined;
  const [onlyStatement, ...rest] = body.getStatements();
  if (
    rest.length > 0 ||
    !onlyStatement ||
    !Node.isReturnStatement(onlyStatement)
  ) {
    return undefined;
  }
  return onlyStatement.getExpression();
};

export const isUserCode = (node: Node) => {
  const sourceFile = node.getSourceFile();
  return !sourceFile.isDeclarationFile() && !sourceFile.isInNodeModules();
};

export const getLiteralValues = (type: Type) => {
  const nonNullable = type.getNonNullableType();
  const element = nonNullable.getArrayElementType() ?? nonNullable;
  const members = element.isUnion() ? element.getUnionTypes() : [element];
  const values = members.map((member) => member.getLiteralValue());
  const literal = values.every(
    (value) => typeof value === 'string' || typeof value === 'number',
  );
  if (!literal) return undefined;
  return values as (string | number)[];
};

export const getAwaitedReturnType = (method: MethodDeclaration) => {
  const returnType = method.getReturnType();
  return (
    (
      returnType as { getAwaitedType?: () => typeof returnType }
    ).getAwaitedType?.() ?? returnType
  );
};

export const getTopLevelTypeNames = (filePath: string) =>
  ts
    .createSourceFile(
      filePath,
      readFileSync(filePath, 'utf-8'),
      ts.ScriptTarget.Latest,
      false,
    )
    .statements.flatMap((statement) =>
      (ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name
        ? [statement.name.text]
        : [],
    );

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const identifierPattern = (name: string, flags?: string) =>
  new RegExp(`(?<![\\w$])${escapeRegExp(name)}(?![\\w$])`, flags);
