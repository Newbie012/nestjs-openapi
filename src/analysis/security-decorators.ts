/**
 * Security decorator extraction utilities.
 *
 * Extracts security requirements from NestJS Swagger decorators:
 * - @ApiBearerAuth(name?)    -> HTTP Bearer auth
 * - @ApiBasicAuth(name?)     -> HTTP Basic auth
 * - @ApiOAuth2(scopes, name?) -> OAuth2 with scopes
 * - @ApiSecurity(name, scopes?) -> Generic security
 * - @ApiSecurity({ a: [], b: [] }) -> Schemes needed together
 * - @ApiCookieAuth(name?)    -> Cookie-based auth
 */

import type { ClassDeclaration, MethodDeclaration } from 'ts-morph';
import type { MethodSecurityRequirement } from '../model/domain.js';
import {
  getEffectiveDecoratorsInApplyOrder,
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

const readStringArray = (value: StaticValue | undefined) =>
  value?.kind === 'array' ? asStrings(value.items) : [];

const readObjectRequirement = (
  value: StaticValue,
): MethodSecurityRequirement | undefined => {
  if (value.kind !== 'object') return undefined;
  const entries = Object.entries(value.properties).map(
    ([scheme, scopes]) => [scheme, readStringArray(scopes)] as const,
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

/**
 * Parses a single security decorator into the one requirement it adds.
 */
const parseSecurityDecorator = (
  call: DecoratorCall,
): MethodSecurityRequirement | undefined => {
  switch (call.name) {
    case 'ApiBearerAuth':
    case 'ApiBasicAuth':
    case 'ApiCookieAuth': {
      const schemeName =
        asString(call.args[0]) ?? DEFAULT_SCHEME_NAMES[call.name]!;
      return { [schemeName]: [] };
    }

    case 'ApiOAuth2': {
      const schemeName =
        asString(call.args[1]) ?? DEFAULT_SCHEME_NAMES[call.name]!;
      return { [schemeName]: readStringArray(call.args[0]) };
    }

    case 'ApiSecurity': {
      const [nameOrRequirement, scopes] = call.args;
      if (!nameOrRequirement) return undefined;
      const schemeName = asString(nameOrRequirement);
      if (schemeName === undefined) {
        return readObjectRequirement(nameOrRequirement);
      }
      return { [schemeName]: readStringArray(scopes) };
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
 * Extracts the security requirements of an operation, one per decorator, as
 * @nestjs/swagger lists them: the controller's, then the method's, each in
 * the order Nest runs the decorators (bottom to top).
 */
export const extractSecurity = (
  controller: ClassDeclaration,
  method: MethodDeclaration,
  expansion?: DecoratorExpansionOptions,
): readonly MethodSecurityRequirement[] => [
  ...extractSecurityFromCalls(
    getEffectiveDecoratorsInApplyOrder(controller, expansion),
  ),
  ...extractSecurityFromCalls(
    getEffectiveDecoratorsInApplyOrder(method, expansion),
  ),
];
