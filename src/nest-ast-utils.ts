import { ClassDeclaration, ts } from "ts-morph";
import { ASTUtils } from "./ast-utils";

export class NestASTUtils {
  static isModuleClass(cls: ClassDeclaration | undefined): boolean {
    return !!cls?.getDecorators().find((d) => d.getName() === "Module");
  }

  static getModuleDecoratorArg(cls: ClassDeclaration) {
    return cls
      .getDecorators()
      .find((d) => d.getName() === "Module")
      ?.getArguments?.()[0]
      ?.asKind?.(ts.SyntaxKind.ObjectLiteralExpression);
  }

  static resolveClassFromExpression(
    expr: import("ts-morph").Expression | undefined
  ): ClassDeclaration | undefined {
    if (!expr) return;

    const id = expr.asKind?.(ts.SyntaxKind.Identifier);
    const symbol = id?.getSymbol() ?? id?.getDefinitionNodes()[0]?.getSymbol();
    if (symbol) return ASTUtils.resolveClassFromSymbol(symbol);

    const call = expr.asKind?.(ts.SyntaxKind.CallExpression);
    if (
      call &&
      call.getExpression().getText().endsWith("forwardRef") &&
      call.getArguments().length > 0
    ) {
      const arrow = call.getArguments()[0]?.asKind(ts.SyntaxKind.ArrowFunction);
      if (!arrow) return;
      const body = arrow.getBody();

      const bodyId = body.asKind?.(ts.SyntaxKind.Identifier);
      if (bodyId) return this.resolveClassFromExpression(bodyId);

      const block = body.asKind?.(ts.SyntaxKind.Block);
      const retExpr = block
        ?.getStatements()
        .find((s) => s.getKind() === ts.SyntaxKind.ReturnStatement)
        ?.asKind(ts.SyntaxKind.ReturnStatement)
        ?.getExpression();
      return this.resolveClassFromExpression(retExpr);
    }

    const pae = expr.asKind?.(ts.SyntaxKind.PropertyAccessExpression);
    if (pae) return this.resolveClassFromExpression(pae.getNameNode());

    return;
  }

  static resolveArrayOfClasses(
    propInit?: import("ts-morph").Expression
  ): ClassDeclaration[] {
    const arr = propInit?.asKind?.(ts.SyntaxKind.ArrayLiteralExpression);
    if (!arr) return [];

    return arr.getElements().flatMap((element) => {
      if (element.isKind(ts.SyntaxKind.SpreadElement)) return [];

      const candidate = this.resolveClassFromExpression(
        element as unknown as import("ts-morph").Expression
      );

      return candidate ? [candidate] : [];
    });
  }
}
