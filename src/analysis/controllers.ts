import type { ClassDeclaration, MethodDeclaration, Decorator } from 'ts-morph';
import { ts } from 'ts-morph';
import {
  findDecorator,
  findDecorators,
  type DecoratorExpansionOptions,
} from './decorators.js';
import { asString, asStrings } from './static-value.js';

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

export const getControllerPrefix = (
  controller: ClassDeclaration,
  expansion?: DecoratorExpansionOptions,
): string => {
  const call = findDecorator(controller, 'Controller', expansion);
  if (!call) return '/';

  const [arg] = call.args;
  const value =
    asString(arg) ??
    (arg?.kind === 'object' ? asString(arg.properties['path']) : undefined);
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
  expansion?: DecoratorExpansionOptions,
): readonly string[] => {
  const apiTagsCalls = findDecorators(controller, 'ApiTags', expansion);

  if (apiTagsCalls.length === 0) {
    const name = getControllerName(controller);
    // Keep PascalCase, just remove 'Controller' suffix (matches NestJS Swagger behavior)
    return [name.replace(/Controller$/i, '')];
  }

  const tags = apiTagsCalls.flatMap((call) => asStrings(call.args));

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
