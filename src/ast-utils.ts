import { ClassDeclaration, ts } from "ts-morph";

export class ASTUtils {
  static resolveClassFromSymbol(sym: import("ts-morph").Symbol) {
    const target = (sym as any).getAliasedSymbol?.() ?? sym;
    return (target.getDeclarations() ?? []).find(
      (d: any) => d.getKind?.() === ts.SyntaxKind.ClassDeclaration
    ) as ClassDeclaration | undefined;
  }

  static getArrayInitializer(params: {
    objectLiteral: import("ts-morph").ObjectLiteralExpression;
    propertyName: string;
  }) {
    const { objectLiteral, propertyName } = params;

    return objectLiteral
      .getProperty(propertyName)
      ?.asKind(ts.SyntaxKind.PropertyAssignment)
      ?.getInitializer();
  }
}
