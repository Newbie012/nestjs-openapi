import { ClassDeclaration, ts } from "ts-morph";
import { NestASTUtils } from "./nest-ast-utils";
import { ASTUtils } from "./ast-utils";
import { NestResolvedController } from "./nest-controller-explorer";
import { Context } from "./resolver";

export class NestModuleExplorer {
  constructor(protected readonly ctx: Context) {}

  getModules(root: ClassDeclaration): {
    declaration: ClassDeclaration;
    controllers: NestResolvedController[];
  }[] {
    const results: Array<{
      declaration: ClassDeclaration;
      controllers: NestResolvedController[];
    }> = [];
    const visited = new Set<string>();

    const keyFor = (mod: ClassDeclaration) =>
      `${mod.getSourceFile().getFilePath()}::${mod.getName() ?? "<anonymous>"}`;

    if (!NestASTUtils.isModuleClass(root)) {
      this.ctx.logger.warn("Root is not a Nest module", {
        className: root.getName() ?? "<anonymous>",
        file: root.getSourceFile().getFilePath(),
      });
      return results;
    }

    this.ctx.logger.debug("Starting module traversal", {
      root: root.getName() ?? "<anonymous>",
      file: root.getSourceFile().getFilePath(),
    });

    const stack: ClassDeclaration[] = [root];
    while (stack.length) {
      const mod = stack.pop()!;
      const vkey = keyFor(mod);
      if (visited.has(vkey)) continue;
      visited.add(vkey);

      const { controllers, imports } = this.extractModuleInfo(mod);
      if (controllers.length) results.push({ declaration: mod, controllers });
      if (imports.length) stack.push(...imports);
    }

    this.ctx.logger.debug("Traversal finished", {
      modulesWithControllers: results.length,
    });

    return results;
  }

  private extractModuleInfo(mod: ClassDeclaration): {
    controllers: NestResolvedController[];
    imports: ClassDeclaration[];
  } {
    const modArg = NestASTUtils.getModuleDecoratorArg(mod);
    if (!modArg) return { controllers: [], imports: [] };

    const obj = modArg.asKindOrThrow(ts.SyntaxKind.ObjectLiteralExpression);

    const controllersInit =
      ASTUtils.getArrayInitializer({
        objectLiteral: obj,
        propertyName: "controllers",
      }) ??
      ASTUtils.getArrayInitializer({
        objectLiteral: obj,
        propertyName: "controller",
      });

    const importsInit = ASTUtils.getArrayInitializer({
      objectLiteral: obj,
      propertyName: "imports",
    });

    const controllers = NestASTUtils.resolveArrayOfClasses(
      controllersInit
    ).flatMap((cls) =>
      cls.getName() ? [new NestResolvedController(this.ctx, cls)] : []
    );

    const imports = NestASTUtils.resolveArrayOfClasses(importsInit).filter(
      NestASTUtils.isModuleClass
    );

    return { controllers, imports };
  }
}
