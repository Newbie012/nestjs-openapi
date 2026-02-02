import type { ClassDeclaration, MethodDeclaration, Decorator } from 'ts-morph';
import { ts } from 'ts-morph';

const HTTP_DECORATORS = new Set([
  'Get',
  'Post',
  'Put',
  'Patch',
  'Delete',
  'Options',
  'Head',
  'All',
]);

export const normalizePath = (path: string): string => {
  if (!path) return '/';
  let out = path.startsWith('/') ? path : `/${path}`;
  if (out !== '/' && out.endsWith('/')) out = out.slice(0, -1);
  return out;
};

export const getControllerPrefix = (controller: ClassDeclaration): string => {
  const decorator = controller
    .getDecorators()
    .find((d) => d.getName() === 'Controller');
  if (!decorator) return '/';

  const arg = decorator.getArguments()[0];
  const value = arg?.asKind?.(ts.SyntaxKind.StringLiteral)?.getLiteralValue();
  return value ? normalizePath(value) : '/';
};

export const getControllerName = (controller: ClassDeclaration): string =>
  controller.getName() ?? '<anonymous>';

export const isHttpMethod = (method: MethodDeclaration): boolean =>
  method.getDecorators().some((d) => HTTP_DECORATORS.has(d.getName()));

export const getHttpMethods = (
  controller: ClassDeclaration,
): readonly MethodDeclaration[] => controller.getMethods().filter(isHttpMethod);

/** Handles both @Get and @Get() syntax */
export const getDecoratorName = (decorator: Decorator): string => {
  const expr = decorator.getExpression();
  if (expr.getKind() === ts.SyntaxKind.CallExpression) {
    const call = expr.asKindOrThrow(ts.SyntaxKind.CallExpression);
    const exprText = call.getExpression().getText();
    return exprText.split('.').pop()!;
  }
  return expr.getText().split('.').pop()!;
};

/** Falls back to controller name (minus 'Controller' suffix) if no @ApiTags */
export const getControllerTags = (
  controller: ClassDeclaration,
): readonly string[] => {
  const apiTagsDecorator = controller
    .getDecorators()
    .find((d) => getDecoratorName(d) === 'ApiTags');

  if (!apiTagsDecorator) {
    const name = getControllerName(controller);
    // Keep PascalCase, just remove 'Controller' suffix (matches NestJS Swagger behavior)
    return [name.replace(/Controller$/i, '')];
  }

  const tags = apiTagsDecorator.getArguments().flatMap((arg) => {
    const stringLit = arg.asKind?.(ts.SyntaxKind.StringLiteral);
    return stringLit ? [stringLit.getLiteralValue()] : [];
  });

  return tags.length > 0
    ? tags
    : [
        // Keep PascalCase, just remove 'Controller' suffix
        getControllerName(controller).replace(/Controller$/i, ''),
      ];
};

export const isHttpDecorator = (decorator: Decorator): boolean =>
  HTTP_DECORATORS.has(decorator.getName());

export const getHttpDecorator = (
  method: MethodDeclaration,
): Decorator | undefined =>
  method.getDecorators().find((d) => HTTP_DECORATORS.has(d.getName()));
