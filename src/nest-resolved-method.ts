import { MethodDeclaration, ts } from "ts-morph";
import { Context } from "./resolver";

export type ResolvedParameter = {
  name: string;
  type: "path" | "query" | "header" | "cookie" | "body";
  tsType: string;
  required: boolean;
  description?: string;
  decoratorArgs?: string[];
};

export type ControllerMethodInfo = {
  httpMethod: string;
  path: string;
  methodName: string;
  controllerName: string;
  controllerTags: string[];
  returnType: { type?: string; inline?: string; container?: "array"; filePath?: string };
  parameters: ResolvedParameter[];
};

type ControllerPrefixProvider = {
  getPrefix(): string;
  getName(): string;
  declaration: import("ts-morph").ClassDeclaration;
};

const HTTP_METHODS = {
  Get: "GET",
  Post: "POST",
  Put: "PUT",
  Patch: "PATCH",
  Delete: "DELETE",
  Options: "OPTIONS",
  Head: "HEAD",
  All: "ALL",
} as const;

export class NestResolvedHttpMethod {
  constructor(
    private readonly ctx: Context,
    private readonly controller: ControllerPrefixProvider,
    private readonly method: MethodDeclaration
  ) {}

  getInfo(): ControllerMethodInfo {
    const route = this.getRoute();

    return {
      httpMethod: route.httpMethod,
      path: this.buildFullPath(route.path),
      methodName: this.method.getName(),
      controllerName: this.controller.getName(),
      controllerTags: this.extractTags(),
      returnType: this.getReturnTypeInfo(),
      parameters: this.extractParameters(),
    };
  }

  private buildFullPath(methodPath: string): string {
    const prefix = this.controller.getPrefix().replace(/\/+$/, "");
    const normalizedPath = methodPath.replace(/^\/+/, "");

    if (!prefix && !normalizedPath) return "/";
    if (!normalizedPath) return prefix || "/";
    if (!prefix) return `/${normalizedPath}`;

    return `${prefix}/${normalizedPath}`.replace(/\/+/g, "/");
  }

  static isValidMethod(m: MethodDeclaration): boolean {
    return m.getDecorators().some((d) => d.getName() in HTTP_METHODS);
  }

  private getReturnTypeInfo(): {
    type?: string;
    inline?: string;
    container?: "array";
    filePath?: string;
  } {
    const returnType = this.method.getReturnType();
    const awaited = (returnType as any).getAwaitedType?.() ?? returnType;
    let text = awaited.getText(this.method);

    // Remove Promise wrapper
    const promiseMatch = text.match(/^Promise<(.+)>$/);
    if (promiseMatch) text = promiseMatch[1].trim();

    // Clean up import type syntax
    text = text.replace(/\bimport\([^)]*\)\./g, "");

    // Helper to resolve file path for a type name
    const resolveFilePath = (typeName: string): string | undefined => {
      const symbol = awaited.getSymbol?.();
      if (symbol) {
        const decls = symbol.getDeclarations();
        if (decls && decls.length > 0) {
          return decls[0].getSourceFile().getFilePath();
        }
      }
      return undefined;
    };

    // Handle array types
    if (text.endsWith("[]")) {
      const baseType = text.slice(0, -2);
      const base = this.parseTypeText(baseType);
      return {
        ...base,
        container: "array",
        filePath: base.type ? resolveFilePath(base.type) : undefined,
      };
    }
    const arrayMatch = text.match(/^(?:Readonly)?Array<(.+)>$/);
    if (arrayMatch) {
      const base = this.parseTypeText(arrayMatch[1]);
      return {
        ...base,
        container: "array",
        filePath: base.type ? resolveFilePath(base.type) : undefined,
      };
    }

    const parsed = this.parseTypeText(text);
    return {
      ...parsed,
      filePath: parsed.type ? resolveFilePath(parsed.type) : undefined,
    };
  }

  private parseTypeText(text: string) {
    const trimmed = text.trim();
    return trimmed.startsWith("{") && trimmed.endsWith("}")
      ? { inline: trimmed }
      : { type: trimmed };
  }

  private getRoute(): { httpMethod: string; path: string } {
    const decorator = this.method
      .getDecorators()
      .find((d) => d.getName() in HTTP_METHODS);

    if (!decorator) {
      throw new Error(
        `Method ${this.controller.getName()}.${this.method.getName()} is not an HTTP route`
      );
    }

    const httpMethod =
      HTTP_METHODS[decorator.getName() as keyof typeof HTTP_METHODS];
    const arg = decorator.getArguments()[0];
    const path =
      arg?.asKind?.(ts.SyntaxKind.StringLiteral)?.getLiteralValue() ?? "/";

    return { httpMethod, path: this.normalizePath(path) };
  }

  private normalizePath(path: string): string {
    if (!path) return "/";
    const normalized = path.startsWith("/") ? path : `/${path}`;
    return normalized !== "/" && normalized.endsWith("/")
      ? normalized.slice(0, -1)
      : normalized;
  }

  private extractParameters(): ResolvedParameter[] {
    return this.method.getParameters().reduce<ResolvedParameter[]>((parameters, param) => {
      const relevantDecorator = param
        .getDecorators()
        .find((decorator) =>
          ["Query", "Param", "Body", "Headers"].includes(this.getDecoratorName(decorator))
        );

      if (!relevantDecorator) return parameters;

      const decoratorName = this.getDecoratorName(relevantDecorator);
      const args = relevantDecorator.getArguments();

      const argAggregation = args.reduce(
        (acc, arg) => {
          const stringLit = arg.asKind?.(ts.SyntaxKind.StringLiteral);
          if (!stringLit) return acc;

          const value = stringLit.getLiteralValue();
          const decoratorArgs = [...acc.decoratorArgs, value];
          const paramName = acc.decoratorArgs.length === 0 ? value : acc.paramName;

          return { paramName, decoratorArgs };
        },
        {
          paramName: param.getName(),
          decoratorArgs: [] as string[],
        }
      );

      let parameterType: ResolvedParameter["type"] = "query";
      if (decoratorName === "Param") parameterType = "path";
      else if (decoratorName === "Body") parameterType = "body";
      else if (decoratorName === "Headers") parameterType = "header";

      const paramType = param.getType();
      const tsType = paramType.getText(param);
      const isOptional = param.hasQuestionToken() || param.hasInitializer();
      const { paramName, decoratorArgs } = argAggregation;

      const description = this.extractParameterDescription({
        param,
        paramName,
        paramType: parameterType,
      });

      parameters.push({
        name: paramName,
        type: parameterType,
        tsType,
        required: !isOptional,
        description,
        decoratorArgs:
          decoratorArgs.length > 0 ? decoratorArgs : undefined,
      });

      return parameters;
    }, []);
  }

  private extractParameterDescription(params: {
    param: import("ts-morph").ParameterDeclaration;
    paramName: string;
    paramType: ResolvedParameter["type"];
  }): string | undefined {
    const { param, paramName, paramType } = params;
    // First check parameter-level decorators (less common)
    const paramDecorators = param.getDecorators();
    const apiDecoratorNames = ["ApiQuery", "ApiParam", "ApiBody", "ApiHeader"];

    for (const decorator of paramDecorators) {
      const decoratorName = this.getDecoratorName(decorator);

      if (apiDecoratorNames.includes(decoratorName)) {
        const description = this.extractDescriptionFromDecorator(decorator);
        if (description) return description;
      }
    }

    // Check method-level decorators (more common in NestJS)
    const methodDecorators = this.method.getDecorators();
    
    for (const decorator of methodDecorators) {
      const decoratorName = this.getDecoratorName(decorator);
      
      // Map parameter types to their corresponding decorators
      const decoratorMap: Record<string, string> = {
        query: "ApiQuery",
        path: "ApiParam", 
        header: "ApiHeader",
        body: "ApiBody"
      };
      
      if (decoratorName === decoratorMap[paramType]) {
        const description = this.extractDescriptionFromDecoratorByName({
          decorator,
          paramName,
        });
        if (description) return description;
      }
    }

    // Fallback description
    return undefined;
  }

  private extractDescriptionFromDecorator(decorator: import("ts-morph").Decorator): string | undefined {
    const args = decorator.getArguments();

    // Look for object literal argument
    for (const arg of args) {
      const objLit = arg.asKind?.(ts.SyntaxKind.ObjectLiteralExpression);
      if (objLit) {
        // Find description property
        const descProperty = objLit.getProperty("description");
        if (descProperty) {
          const propAssignment = descProperty.asKind?.(
            ts.SyntaxKind.PropertyAssignment
          );
          if (propAssignment) {
            const initializer = propAssignment.getInitializer();
            const stringLit = initializer?.asKind?.(
              ts.SyntaxKind.StringLiteral
            );
            if (stringLit) {
              return stringLit.getLiteralValue();
            }
          }
        }
      }
    }
    return undefined;
  }

  private extractDescriptionFromDecoratorByName(params: {
    decorator: import("ts-morph").Decorator;
    paramName: string;
  }): string | undefined {
    const { decorator, paramName } = params;
    const args = decorator.getArguments();

    // Look for object literal argument
    for (const arg of args) {
      const objLit = arg.asKind?.(ts.SyntaxKind.ObjectLiteralExpression);
      if (objLit) {
        // Find name property to match parameter
        const nameProperty = objLit.getProperty("name");
        if (nameProperty) {
          const namePropAssignment = nameProperty.asKind?.(
            ts.SyntaxKind.PropertyAssignment
          );
          if (namePropAssignment) {
            const nameInitializer = namePropAssignment.getInitializer();
            const nameStringLit = nameInitializer?.asKind?.(
              ts.SyntaxKind.StringLiteral
            );
            
            // Check if this decorator is for the current parameter
            if (nameStringLit?.getLiteralValue() === paramName) {
              // Find description property
              const descProperty = objLit.getProperty("description");
              if (descProperty) {
                const descPropAssignment = descProperty.asKind?.(
                  ts.SyntaxKind.PropertyAssignment
                );
                if (descPropAssignment) {
                  const descInitializer = descPropAssignment.getInitializer();
                  const descStringLit = descInitializer?.asKind?.(
                    ts.SyntaxKind.StringLiteral
                  );
                  if (descStringLit) {
                    return descStringLit.getLiteralValue();
                  }
                }
              }
            }
          }
        }
      }
    }
    return undefined;
  }

  private extractTags(): string[] {
    const controllerDeclaration = this.controller.declaration;
    const apiTagsDecorator = controllerDeclaration
      .getDecorators()
      .find((d) => this.getDecoratorName(d) === "ApiTags");

    if (!apiTagsDecorator) {
      // Fallback to controller name if no @ApiTags decorator
      return [
        this.controller
          .getName()
          .toLowerCase()
          .replace(/controller$/, ""),
      ];
    }

    const tags = apiTagsDecorator
      .getArguments()
      .flatMap((arg) => {
        const stringLit = arg.asKind?.(ts.SyntaxKind.StringLiteral);
        return stringLit ? [stringLit.getLiteralValue()] : [];
      });

    return tags.length > 0
      ? tags
      : [
          this.controller
            .getName()
            .toLowerCase()
            .replace(/controller$/, ""),
        ];
  }

  private getDecoratorName(decorator: import("ts-morph").Decorator): string {
    const expr = decorator.getExpression();
    if (expr.getKind() === ts.SyntaxKind.CallExpression) {
      const call = expr.asKindOrThrow(ts.SyntaxKind.CallExpression);
      const exprText = call.getExpression().getText();
      return exprText.split(".").pop()!;
    }
    return expr.getText().split(".").pop()!;
  }
}
