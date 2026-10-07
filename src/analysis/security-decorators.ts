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

import type { ClassDeclaration, MethodDeclaration } from 'ts-morph';
import type { MethodSecurityRequirement } from '../model/domain.js';
import {
  getEffectiveDecorators,
  type DecoratorCall,
  type DecoratorExpansionOptions,
} from './decorators.js';
import { asString, asStrings, type StaticValue } from './static-value.js';

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

const readStringArray = (value: StaticValue | undefined) =>
  value?.kind === 'array' ? asStrings(value.items) : [];

/**
 * Parses a single security decorator into a MethodSecurityRequirement.
 */
const parseSecurityDecorator = (
  call: DecoratorCall,
): MethodSecurityRequirement | undefined => {
  switch (call.name) {
    case 'ApiBearerAuth':
    case 'ApiBasicAuth':
    case 'ApiCookieAuth': {
      // @ApiBearerAuth() or @ApiBearerAuth('jwt')
      const schemeName =
        asString(call.args[0]) ?? DEFAULT_SCHEME_NAMES[call.name]!;
      return { schemeName, scopes: [] };
    }

    case 'ApiOAuth2': {
      // @ApiOAuth2(['scope1', 'scope2']) or @ApiOAuth2(['scope1'], 'oauth2-custom')
      const schemeName =
        asString(call.args[1]) ?? DEFAULT_SCHEME_NAMES[call.name]!;
      return { schemeName, scopes: readStringArray(call.args[0]) };
    }

    case 'ApiSecurity': {
      // @ApiSecurity('api-key') or @ApiSecurity('api-key', ['scope'])
      const schemeName = asString(call.args[0]);
      if (!schemeName) return undefined; // ApiSecurity requires a scheme name
      return { schemeName, scopes: readStringArray(call.args[1]) };
    }

    default:
      return undefined;
  }
};

const extractSecurityFromCalls = (
  calls: readonly DecoratorCall[],
): readonly MethodSecurityRequirement[] =>
  calls.flatMap((call) => {
    const requirement = parseSecurityDecorator(call);
    return requirement ? [requirement] : [];
  });

/**
 * Extracts security requirements from a controller class.
 * These apply to all methods unless overridden.
 */
export const extractControllerSecurity = (
  controller: ClassDeclaration,
  expansion?: DecoratorExpansionOptions,
): readonly MethodSecurityRequirement[] =>
  extractSecurityFromCalls(getEffectiveDecorators(controller, expansion));

/**
 * Extracts security requirements from a method.
 * If present, these override controller-level security.
 */
export const extractMethodSecurity = (
  method: MethodDeclaration,
  expansion?: DecoratorExpansionOptions,
): readonly MethodSecurityRequirement[] =>
  extractSecurityFromCalls(getEffectiveDecorators(method, expansion));

/**
 * Checks if a method has any security decorators.
 */
export const hasMethodSecurityDecorators = (
  method: MethodDeclaration,
  expansion?: DecoratorExpansionOptions,
): boolean =>
  getEffectiveDecorators(method, expansion).some((call) =>
    SECURITY_DECORATORS.has(call.name),
  );

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
