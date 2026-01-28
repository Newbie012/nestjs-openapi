import { ClassDeclaration, ts } from "ts-morph";
import { NestResolvedHttpMethod } from "./nest-resolved-method";
import { Context } from "./resolver";

export class NestResolvedController {
  constructor(
    private readonly ctx: Context,
    public readonly declaration: ClassDeclaration
  ) {}

  getMethods(): NestResolvedHttpMethod[] {
    if (!this.declaration.getName()) return [];
    const methods: NestResolvedHttpMethod[] = [];

    for (const method of this.declaration.getMethods()) {
      if (!NestResolvedHttpMethod.isValidMethod(method)) continue;
      const resolved = new NestResolvedHttpMethod(this.ctx, this, method);
      methods.push(resolved);
    }

    this.ctx.logger.debug("Controller inspected", {
      controller: this.declaration.getName(),
      methods: methods.length,
    });

    return methods;
  }

  getName(): string {
    return this.declaration.getName() ?? "<anonymous>";
  }

  getPrefix(): string {
    const decorator = this.declaration
      .getDecorators()
      .find((d) => d.getName() === "Controller");
    if (!decorator) return "/";
    const arg = decorator.getArguments()[0];
    if (!arg) return "/";
    const lit = arg.asKind?.(ts.SyntaxKind.StringLiteral);
    return this.normalizePath(lit?.getLiteralValue() ?? "/");
  }

  private normalizePath(p: string): string {
    if (!p) return "/";
    let out = p.startsWith("/") ? p : `/${p}`;
    if (out !== "/" && out.endsWith("/")) out = out.slice(0, -1);
    return out;
  }
}
