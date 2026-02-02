/**
 * Security decorator extraction utilities.
 *
 * Extracts security requirements from NestJS Swagger decorators:
 * - @ApiBearerAuth(name?)    -> HTTP Bearer auth
 * - @ApiBasicAuth(name?)     -> HTTP Basic auth
 * - @ApiOAuth2(scopes, name?) -> OAuth2 with scopes
 * - @ApiSecurity(name, requirements?) -> Generic security
 * - @ApiCookieAuth(name?)    -> Cookie-based auth
 */

import type { ClassDeclaration, MethodDeclaration, Decorator } from 'ts-morph';
import { ts } from 'ts-morph';
import type { MethodSecurityRequirement } from './domain.js';
import { getDecoratorName } from './controllers.js';

/** Default scheme names for security decorators */
const DEFAULT_SCHEME_NAMES: Record<string, string> = {
  ApiBearerAuth: 'bearer',
  ApiBasicAuth: 'basic',
  ApiOAuth2: 'oauth2',
  ApiCookieAuth: 'cookie',
};

/** Security decorator names to look for */
const SECURITY_DECORATORS = new Set([
  'ApiBearerAuth',
  'ApiBasicAuth',
  'ApiOAuth2',
  'ApiSecurity',
  'ApiCookieAuth',
]);

/**
 * Extracts the first string argument from a decorator.
 * Used for scheme name in @ApiBearerAuth('jwt'), @ApiSecurity('api-key'), etc.
 */
const extractFirstStringArg = (decorator: Decorator): string | undefined => {
  const args = decorator.getArguments();
  if (args.length === 0) return undefined;

  const firstArg = args[0];
  const stringLit = firstArg.asKind?.(ts.SyntaxKind.StringLiteral);
  return stringLit?.getLiteralValue();
};

/**
 * Extracts string array from an array literal expression.
 * Used for scopes in @ApiOAuth2(['read:users', 'write:users']).
 */
const extractStringArray = (decorator: Decorator): readonly string[] => {
  const args = decorator.getArguments();
  if (args.length === 0) return [];

  const firstArg = args[0];
  const arrayLit = firstArg.asKind?.(ts.SyntaxKind.ArrayLiteralExpression);
  if (!arrayLit) return [];

  const scopes: string[] = [];
  for (const element of arrayLit.getElements()) {
    const stringLit = element.asKind?.(ts.SyntaxKind.StringLiteral);
    if (stringLit) {
      scopes.push(stringLit.getLiteralValue());
    }
  }
  return scopes;
};

/**
 * Extracts the second string argument from a decorator.
 * Used for scheme name in @ApiOAuth2(scopes, 'oauth2-custom').
 */
const extractSecondStringArg = (decorator: Decorator): string | undefined => {
  const args = decorator.getArguments();
  if (args.length < 2) return undefined;

  const secondArg = args[1];
  const stringLit = secondArg.asKind?.(ts.SyntaxKind.StringLiteral);
  return stringLit?.getLiteralValue();
};

/**
 * Parses a single security decorator into a MethodSecurityRequirement.
 */
const parseSecurityDecorator = (
  decorator: Decorator,
): MethodSecurityRequirement | undefined => {
  const decoratorName = getDecoratorName(decorator);

  if (!SECURITY_DECORATORS.has(decoratorName)) {
    return undefined;
  }

  switch (decoratorName) {
    case 'ApiBearerAuth':
    case 'ApiBasicAuth':
    case 'ApiCookieAuth': {
      // @ApiBearerAuth() or @ApiBearerAuth('jwt')
      const schemeName =
        extractFirstStringArg(decorator) ?? DEFAULT_SCHEME_NAMES[decoratorName];
      return { schemeName, scopes: [] };
    }

    case 'ApiOAuth2': {
      // @ApiOAuth2(['scope1', 'scope2']) or @ApiOAuth2(['scope1'], 'oauth2-custom')
      const scopes = extractStringArray(decorator);
      const schemeName =
        extractSecondStringArg(decorator) ??
        DEFAULT_SCHEME_NAMES[decoratorName];
      return { schemeName, scopes: [...scopes] };
    }

    case 'ApiSecurity': {
      // @ApiSecurity('api-key') or @ApiSecurity('api-key', ['scope'])
      const schemeName = extractFirstStringArg(decorator);
      if (!schemeName) return undefined; // ApiSecurity requires a scheme name

      // Check if second argument is an array of scopes
      const args = decorator.getArguments();
      const scopes: string[] = [];
      if (args.length >= 2) {
        const secondArg = args[1];
        const arrayLit = secondArg.asKind?.(
          ts.SyntaxKind.ArrayLiteralExpression,
        );
        if (arrayLit) {
          for (const element of arrayLit.getElements()) {
            const stringLit = element.asKind?.(ts.SyntaxKind.StringLiteral);
            if (stringLit) {
              scopes.push(stringLit.getLiteralValue());
            }
          }
        }
      }
      return { schemeName, scopes };
    }

    default:
      return undefined;
  }
};

/**
 * Extracts all security requirements from a list of decorators.
 */
const extractSecurityFromDecorators = (
  decorators: readonly Decorator[],
): readonly MethodSecurityRequirement[] => {
  const requirements: MethodSecurityRequirement[] = [];

  for (const decorator of decorators) {
    const requirement = parseSecurityDecorator(decorator);
    if (requirement) {
      requirements.push(requirement);
    }
  }

  return requirements;
};

/**
 * Extracts security requirements from a controller class.
 * These apply to all methods unless overridden.
 */
export const extractControllerSecurity = (
  controller: ClassDeclaration,
): readonly MethodSecurityRequirement[] =>
  extractSecurityFromDecorators(controller.getDecorators());

/**
 * Extracts security requirements from a method.
 * If present, these override controller-level security.
 */
export const extractMethodSecurity = (
  method: MethodDeclaration,
): readonly MethodSecurityRequirement[] =>
  extractSecurityFromDecorators(method.getDecorators());

/**
 * Checks if a method has any security decorators.
 */
export const hasMethodSecurityDecorators = (
  method: MethodDeclaration,
): boolean =>
  method
    .getDecorators()
    .some((d) => SECURITY_DECORATORS.has(getDecoratorName(d)));

/**
 * Combines controller-level and method-level security requirements.
 *
 * Rules:
 * - If method has security decorators, those are used (override)
 * - If method has no security decorators, controller security is used
 * - Empty array means no decorator-level security (inherits global)
 */
export const combineSecurityRequirements = (
  controllerSecurity: readonly MethodSecurityRequirement[],
  methodSecurity: readonly MethodSecurityRequirement[],
  hasMethodDecorators: boolean,
): readonly MethodSecurityRequirement[] => {
  // Method-level security overrides controller-level
  if (hasMethodDecorators) {
    return methodSecurity;
  }

  // No method decorators - use controller security
  return controllerSecurity;
};
