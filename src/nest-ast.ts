import { Option } from 'effect';
import type {
  ClassDeclaration,
  Expression,
  ObjectLiteralExpression,
} from 'ts-morph';
import { ts } from 'ts-morph';
import { resolveClassFromSymbol, getArrayInitializer } from './ast.js';

export const isModuleClass = (cls: ClassDeclaration | undefined): boolean =>
  cls?.getDecorators().some((d) => d.getName() === 'Module') ?? false;

export const getModuleDecoratorArg = (
  cls: ClassDeclaration,
): Option.Option<ObjectLiteralExpression> => {
  const decorator = cls.getDecorators().find((d) => d.getName() === 'Module');
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

  // Try direct identifier
  const id = expr.asKind?.(ts.SyntaxKind.Identifier);
  const symbol = id?.getSymbol() ?? id?.getDefinitionNodes()[0]?.getSymbol();
  if (symbol) return resolveClassFromSymbol(symbol);

  // Try forwardRef(() => SomeClass)
  const call = expr.asKind?.(ts.SyntaxKind.CallExpression);
  if (call && call.getExpression().getText().endsWith('forwardRef')) {
    const args = call.getArguments();
    if (args.length === 0) return Option.none();

    const arrow = args[0]?.asKind(ts.SyntaxKind.ArrowFunction);
    if (!arrow) return Option.none();

    const body = arrow.getBody();
    const bodyId = body.asKind?.(ts.SyntaxKind.Identifier);
    if (bodyId) return resolveClassFromExpression(bodyId);

    const block = body.asKind?.(ts.SyntaxKind.Block);
    const retExpr = block
      ?.getStatements()
      .find((s) => s.getKind() === ts.SyntaxKind.ReturnStatement)
      ?.asKind(ts.SyntaxKind.ReturnStatement)
      ?.getExpression();
    return resolveClassFromExpression(retExpr);
  }

  // Try property access expression
  const pae = expr.asKind?.(ts.SyntaxKind.PropertyAccessExpression);
  if (pae) return resolveClassFromExpression(pae.getNameNode());

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
  const modArgOpt = getModuleDecoratorArg(mod);
  if (Option.isNone(modArgOpt)) {
    return { controllers: [], imports: [] };
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

  const imports = resolveArrayOfClasses(importsInit).filter(isModuleClass);

  return { controllers, imports };
};
