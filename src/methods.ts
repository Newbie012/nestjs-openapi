import { Option } from 'effect';
import type {
  MethodDeclaration,
  ClassDeclaration,
  Decorator,
  ParameterDeclaration,
} from 'ts-morph';
import { ts } from 'ts-morph';
import type {
  MethodInfo,
  ResolvedParameter,
  ReturnTypeInfo,
  HttpMethod,
  ParameterLocation,
  OperationMetadata,
  ResponseMetadata,
} from './domain.js';
import {
  getControllerPrefix,
  getControllerName,
  getControllerTags,
  getDecoratorName,
  normalizePath,
  getHttpDecorator,
} from './controllers.js';
import {
  extractControllerSecurity,
  extractMethodSecurity,
  hasMethodSecurityDecorators,
  combineSecurityRequirements,
} from './security-decorators.js';

const HTTP_METHOD_MAP: Record<string, HttpMethod> = {
  Get: 'GET',
  Post: 'POST',
  Put: 'PUT',
  Patch: 'PATCH',
  Delete: 'DELETE',
  Options: 'OPTIONS',
  Head: 'HEAD',
  All: 'ALL',
};

const PARAMETER_DECORATOR_MAP: Record<string, ParameterLocation> = {
  Param: 'path',
  Query: 'query',
  Body: 'body',
  Headers: 'header',
};

const buildFullPath = (
  controllerPrefix: string,
  methodPath: string,
): string => {
  const prefix = controllerPrefix.replace(/\/+$/, '');
  const normalizedPath = methodPath.replace(/^\/+/, '');

  if (!prefix && !normalizedPath) return '/';
  if (!normalizedPath) return prefix || '/';
  if (!prefix) return `/${normalizedPath}`;

  return `${prefix}/${normalizedPath}`.replace(/\/+/g, '/');
};

const getRoutePath = (decorator: Decorator): string => {
  const arg = decorator.getArguments()[0];
  const stringLit = arg?.asKind?.(ts.SyntaxKind.StringLiteral);
  return normalizePath(stringLit?.getLiteralValue() ?? '/');
};

const parseTypeText = (
  text: string,
): { type: Option.Option<string>; inline: Option.Option<string> } => {
  const trimmed = text.trim();
  return trimmed.startsWith('{') && trimmed.endsWith('}')
    ? { type: Option.none(), inline: Option.some(trimmed) }
    : { type: Option.some(trimmed), inline: Option.none() };
};

const getReturnTypeInfo = (method: MethodDeclaration): ReturnTypeInfo => {
  const returnType = method.getReturnType();
  const awaited =
    (
      returnType as { getAwaitedType?: () => typeof returnType }
    ).getAwaitedType?.() ?? returnType;
  let text = awaited.getText(method);

  const promiseMatch = text.match(/^Promise<(.+)>$/);
  if (promiseMatch) text = promiseMatch[1].trim();

  // Clean import(...).TypeName to just TypeName
  text = text.replace(/\bimport\([^)]*\)\./g, '');

  const resolveFilePath = (): Option.Option<string> => {
    const symbol = awaited.getSymbol?.();
    if (symbol) {
      const decls = symbol.getDeclarations();
      if (decls && decls.length > 0) {
        return Option.some(decls[0].getSourceFile().getFilePath());
      }
    }
    return Option.none();
  };

  if (text.endsWith('[]')) {
    const baseType = text.slice(0, -2);
    const base = parseTypeText(baseType);
    return {
      ...base,
      container: Option.some('array' as const),
      filePath: Option.isSome(base.type) ? resolveFilePath() : Option.none(),
    };
  }

  const arrayMatch = text.match(/^(?:Readonly)?Array<(.+)>$/);
  if (arrayMatch) {
    const base = parseTypeText(arrayMatch[1]);
    return {
      ...base,
      container: Option.some('array' as const),
      filePath: Option.isSome(base.type) ? resolveFilePath() : Option.none(),
    };
  }

  const parsed = parseTypeText(text);
  return {
    ...parsed,
    container: Option.none(),
    filePath: Option.isSome(parsed.type) ? resolveFilePath() : Option.none(),
  };
};

const extractDescriptionFromDecorator = (
  decorator: Decorator,
): Option.Option<string> => {
  for (const arg of decorator.getArguments()) {
    const objLit = arg.asKind?.(ts.SyntaxKind.ObjectLiteralExpression);
    if (!objLit) continue;

    const descProperty = objLit.getProperty('description');
    if (!descProperty) continue;

    const propAssignment = descProperty.asKind?.(
      ts.SyntaxKind.PropertyAssignment,
    );
    if (!propAssignment) continue;

    const initializer = propAssignment.getInitializer();
    const stringLit = initializer?.asKind?.(ts.SyntaxKind.StringLiteral);
    if (!stringLit) continue;

    return Option.some(stringLit.getLiteralValue());
  }
  return Option.none();
};

/** Matches decorator by name property for method-level @ApiQuery, @ApiParam, etc. */
const extractDescriptionByName = (
  decorator: Decorator,
  paramName: string,
): Option.Option<string> => {
  for (const arg of decorator.getArguments()) {
    const objLit = arg.asKind?.(ts.SyntaxKind.ObjectLiteralExpression);
    if (!objLit) continue;

    const nameProperty = objLit.getProperty('name');
    if (!nameProperty) continue;

    const namePropAssignment = nameProperty.asKind?.(
      ts.SyntaxKind.PropertyAssignment,
    );
    if (!namePropAssignment) continue;

    const nameInitializer = namePropAssignment.getInitializer();
    const nameStringLit = nameInitializer?.asKind?.(
      ts.SyntaxKind.StringLiteral,
    );
    if (nameStringLit?.getLiteralValue() !== paramName) continue;

    const descProperty = objLit.getProperty('description');
    if (!descProperty) continue;

    const descPropAssignment = descProperty.asKind?.(
      ts.SyntaxKind.PropertyAssignment,
    );
    if (!descPropAssignment) continue;

    const descInitializer = descPropAssignment.getInitializer();
    const descStringLit = descInitializer?.asKind?.(
      ts.SyntaxKind.StringLiteral,
    );
    if (!descStringLit) continue;

    return Option.some(descStringLit.getLiteralValue());
  }
  return Option.none();
};

/** Checks param-level decorators first, then method-level @ApiQuery/@ApiParam */
const extractParameterDescription = (
  method: MethodDeclaration,
  param: ParameterDeclaration,
  paramName: string,
  paramLocation: ParameterLocation,
): Option.Option<string> => {
  const apiDecoratorNames = ['ApiQuery', 'ApiParam', 'ApiBody', 'ApiHeader'];

  for (const decorator of param.getDecorators()) {
    const decoratorName = getDecoratorName(decorator);
    if (apiDecoratorNames.includes(decoratorName)) {
      const desc = extractDescriptionFromDecorator(decorator);
      if (Option.isSome(desc)) return desc;
    }
  }

  const decoratorMap: Record<string, string> = {
    query: 'ApiQuery',
    path: 'ApiParam',
    header: 'ApiHeader',
    body: 'ApiBody',
  };

  for (const decorator of method.getDecorators()) {
    const decoratorName = getDecoratorName(decorator);
    if (decoratorName === decoratorMap[paramLocation]) {
      const desc = extractDescriptionByName(decorator, paramName);
      if (Option.isSome(desc)) return desc;
    }
  }

  return Option.none();
};

const extractParameters = (
  method: MethodDeclaration,
): readonly ResolvedParameter[] =>
  method.getParameters().reduce<ResolvedParameter[]>((params, param) => {
    const relevantDecorator = param
      .getDecorators()
      .find((d) => d.getName() in PARAMETER_DECORATOR_MAP);

    if (!relevantDecorator) return params;

    const decoratorName = relevantDecorator.getName();
    const args = relevantDecorator.getArguments();

    let paramName = param.getName();
    for (const arg of args) {
      const stringLit = arg.asKind?.(ts.SyntaxKind.StringLiteral);
      if (stringLit) {
        paramName = stringLit.getLiteralValue();
        break;
      }
    }

    const location = PARAMETER_DECORATOR_MAP[decoratorName] ?? 'query';
    const paramType = param.getType();
    const tsType = paramType.getText(param);
    const isOptional = param.hasQuestionToken() || param.hasInitializer();
    const description = extractParameterDescription(
      method,
      param,
      paramName,
      location,
    );

    params.push({
      name: paramName,
      location,
      tsType,
      required: !isOptional,
      description,
    });

    return params;
  }, []);

/** Extracts all decorator names from a method */
const extractDecoratorNames = (method: MethodDeclaration): readonly string[] =>
  method.getDecorators().map((d) => getDecoratorName(d));

/** Extracts string arguments from a decorator (e.g., @ApiConsumes('application/json', 'multipart/form-data')) */
const extractStringArguments = (decorator: Decorator): readonly string[] => {
  const args = decorator.getArguments();
  const results: string[] = [];
  for (const arg of args) {
    const stringLit = arg.asKind?.(ts.SyntaxKind.StringLiteral);
    if (stringLit) {
      results.push(stringLit.getLiteralValue());
    }
  }
  return results;
};

/** Extracts content types from @ApiConsumes decorator */
const extractApiConsumes = (method: MethodDeclaration): readonly string[] => {
  for (const decorator of method.getDecorators()) {
    const decoratorName = getDecoratorName(decorator);
    if (decoratorName === 'ApiConsumes') {
      return extractStringArguments(decorator);
    }
  }
  return [];
};

/** Extracts content types from @ApiProduces decorator */
const extractApiProduces = (method: MethodDeclaration): readonly string[] => {
  for (const decorator of method.getDecorators()) {
    const decoratorName = getDecoratorName(decorator);
    if (decoratorName === 'ApiProduces') {
      return extractStringArguments(decorator);
    }
  }
  return [];
};

/** Extracts a string property from an object literal expression */
const extractStringPropertyFromObjectLiteral = (
  decorator: Decorator,
  propertyName: string,
): Option.Option<string> => {
  const arg = decorator.getArguments()[0];
  const objLit = arg?.asKind?.(ts.SyntaxKind.ObjectLiteralExpression);
  if (!objLit) return Option.none();

  const property = objLit.getProperty(propertyName);
  if (!property) return Option.none();

  const propAssignment = property.asKind?.(ts.SyntaxKind.PropertyAssignment);
  if (!propAssignment) return Option.none();

  const initializer = propAssignment.getInitializer();
  const stringLit = initializer?.asKind?.(ts.SyntaxKind.StringLiteral);
  if (stringLit) {
    return Option.some(stringLit.getLiteralValue());
  }
  return Option.none();
};

/** Extracts a boolean property from a decorator's object literal argument */
const extractBooleanPropertyFromDecorator = (
  decorator: Decorator,
  propertyName: string,
): Option.Option<boolean> => {
  const arg = decorator.getArguments()[0];
  const objLit = arg?.asKind?.(ts.SyntaxKind.ObjectLiteralExpression);
  if (!objLit) return Option.none();

  const property = objLit.getProperty(propertyName);
  if (!property) return Option.none();

  const propAssignment = property.asKind?.(ts.SyntaxKind.PropertyAssignment);
  if (!propAssignment) return Option.none();

  const initializer = propAssignment.getInitializer();
  if (initializer?.getKind() === ts.SyntaxKind.TrueKeyword) {
    return Option.some(true);
  }
  if (initializer?.getKind() === ts.SyntaxKind.FalseKeyword) {
    return Option.some(false);
  }
  return Option.none();
};

/** HttpStatus enum values for resolving HttpStatus.XXX references */
const HTTP_STATUS_MAP: Record<string, number> = {
  CONTINUE: 100,
  SWITCHING_PROTOCOLS: 101,
  PROCESSING: 102,
  EARLYHINTS: 103,
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NON_AUTHORITATIVE_INFORMATION: 203,
  NO_CONTENT: 204,
  RESET_CONTENT: 205,
  PARTIAL_CONTENT: 206,
  AMBIGUOUS: 300,
  MOVED_PERMANENTLY: 301,
  FOUND: 302,
  SEE_OTHER: 303,
  NOT_MODIFIED: 304,
  TEMPORARY_REDIRECT: 307,
  PERMANENT_REDIRECT: 308,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  NOT_ACCEPTABLE: 406,
  PROXY_AUTHENTICATION_REQUIRED: 407,
  REQUEST_TIMEOUT: 408,
  CONFLICT: 409,
  GONE: 410,
  LENGTH_REQUIRED: 411,
  PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  URI_TOO_LONG: 414,
  UNSUPPORTED_MEDIA_TYPE: 415,
  REQUESTED_RANGE_NOT_SATISFIABLE: 416,
  EXPECTATION_FAILED: 417,
  I_AM_A_TEAPOT: 418,
  MISDIRECTED: 421,
  UNPROCESSABLE_ENTITY: 422,
  FAILED_DEPENDENCY: 424,
  PRECONDITION_REQUIRED: 428,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
  HTTP_VERSION_NOT_SUPPORTED: 505,
};

/** Extracts a number property from a decorator's object literal argument */
const extractNumberPropertyFromDecorator = (
  decorator: Decorator,
  propertyName: string,
): Option.Option<number> => {
  const arg = decorator.getArguments()[0];
  const objLit = arg?.asKind?.(ts.SyntaxKind.ObjectLiteralExpression);
  if (!objLit) return Option.none();

  const property = objLit.getProperty(propertyName);
  if (!property) return Option.none();

  const propAssignment = property.asKind?.(ts.SyntaxKind.PropertyAssignment);
  if (!propAssignment) return Option.none();

  const initializer = propAssignment.getInitializer();

  // Handle numeric literal: status: 409
  const numLit = initializer?.asKind?.(ts.SyntaxKind.NumericLiteral);
  if (numLit) {
    return Option.some(Number(numLit.getLiteralValue()));
  }

  // Handle HttpStatus.XXX: status: HttpStatus.CONFLICT
  const propAccess = initializer?.asKind?.(
    ts.SyntaxKind.PropertyAccessExpression,
  );
  if (propAccess) {
    const statusName = propAccess.getName();
    if (statusName && HTTP_STATUS_MAP[statusName] !== undefined) {
      return Option.some(HTTP_STATUS_MAP[statusName]);
    }
  }

  return Option.none();
};

/** Extracts @HttpCode decorator value */
const extractHttpCode = (method: MethodDeclaration): Option.Option<number> => {
  for (const decorator of method.getDecorators()) {
    const decoratorName = getDecoratorName(decorator);
    if (decoratorName === 'HttpCode') {
      const arg = decorator.getArguments()[0];
      if (!arg) continue;

      // Handle numeric literal: @HttpCode(201)
      const numLit = arg.asKind?.(ts.SyntaxKind.NumericLiteral);
      if (numLit) {
        return Option.some(Number(numLit.getLiteralValue()));
      }

      // Handle HttpStatus.XXX: @HttpCode(HttpStatus.CREATED)
      const propAccess = arg.asKind?.(ts.SyntaxKind.PropertyAccessExpression);
      if (propAccess) {
        const statusName = propAccess.getName();
        if (statusName && HTTP_STATUS_MAP[statusName] !== undefined) {
          return Option.some(HTTP_STATUS_MAP[statusName]);
        }
      }
    }
  }
  return Option.none();
};

/** Extracts type from @ApiResponse type property - handles both Dto and [Dto] syntax */
const extractResponseType = (
  decorator: Decorator,
): { type: Option.Option<string>; isArray: boolean } => {
  const arg = decorator.getArguments()[0];
  const objLit = arg?.asKind?.(ts.SyntaxKind.ObjectLiteralExpression);
  if (!objLit) return { type: Option.none(), isArray: false };

  const typeProperty = objLit.getProperty('type');
  if (!typeProperty) return { type: Option.none(), isArray: false };

  const propAssignment = typeProperty.asKind?.(
    ts.SyntaxKind.PropertyAssignment,
  );
  if (!propAssignment) return { type: Option.none(), isArray: false };

  const initializer = propAssignment.getInitializer();
  if (!initializer) return { type: Option.none(), isArray: false };

  // Handle array syntax: type: [UserDto]
  const arrayLit = initializer.asKind?.(ts.SyntaxKind.ArrayLiteralExpression);
  if (arrayLit) {
    const elements = arrayLit.getElements();
    if (elements.length > 0) {
      const firstElement = elements[0];
      const identifier = firstElement.asKind?.(ts.SyntaxKind.Identifier);
      if (identifier) {
        return { type: Option.some(identifier.getText()), isArray: true };
      }
    }
    return { type: Option.none(), isArray: true };
  }

  // Handle direct reference: type: UserDto
  const identifier = initializer.asKind?.(ts.SyntaxKind.Identifier);
  if (identifier) {
    return { type: Option.some(identifier.getText()), isArray: false };
  }

  return { type: Option.none(), isArray: false };
};

/** Extracts all @ApiResponse decorators from a method */
const extractApiResponses = (
  method: MethodDeclaration,
): readonly ResponseMetadata[] => {
  const responses: ResponseMetadata[] = [];

  for (const decorator of method.getDecorators()) {
    const decoratorName = getDecoratorName(decorator);
    if (decoratorName === 'ApiResponse') {
      const statusCode = extractNumberPropertyFromDecorator(
        decorator,
        'status',
      );
      if (Option.isNone(statusCode)) continue;

      const description = extractStringPropertyFromObjectLiteral(
        decorator,
        'description',
      );
      const { type, isArray } = extractResponseType(decorator);

      responses.push({
        statusCode: statusCode.value,
        description,
        type,
        isArray,
      });
    }
  }

  return responses;
};

/** Extracts metadata from @ApiOperation decorator */
const extractApiOperationMetadata = (
  method: MethodDeclaration,
): OperationMetadata => {
  for (const decorator of method.getDecorators()) {
    const decoratorName = getDecoratorName(decorator);
    if (decoratorName === 'ApiOperation') {
      return {
        summary: extractStringPropertyFromObjectLiteral(decorator, 'summary'),
        description: extractStringPropertyFromObjectLiteral(
          decorator,
          'description',
        ),
        operationId: extractStringPropertyFromObjectLiteral(
          decorator,
          'operationId',
        ),
        deprecated: extractBooleanPropertyFromDecorator(
          decorator,
          'deprecated',
        ),
      };
    }
  }
  // Return empty metadata if no @ApiOperation found
  return {
    summary: Option.none(),
    description: Option.none(),
    operationId: Option.none(),
    deprecated: Option.none(),
  };
};

/** Returns None if the method has no HTTP decorator */
export const getMethodInfo = (
  controller: ClassDeclaration,
  method: MethodDeclaration,
): Option.Option<MethodInfo> => {
  const httpDecorator = getHttpDecorator(method);
  if (!httpDecorator) return Option.none();

  const decoratorName = httpDecorator.getName();
  const httpMethod = HTTP_METHOD_MAP[decoratorName];
  if (!httpMethod) return Option.none();

  const controllerPrefix = getControllerPrefix(controller);
  const methodPath = getRoutePath(httpDecorator);
  const fullPath = buildFullPath(controllerPrefix, methodPath);

  // Extract security requirements from controller and method decorators
  const controllerSecurity = extractControllerSecurity(controller);
  const methodSecurity = extractMethodSecurity(method);
  const hasMethodSecurity = hasMethodSecurityDecorators(method);
  const security = combineSecurityRequirements(
    controllerSecurity,
    methodSecurity,
    hasMethodSecurity,
  );

  return Option.some({
    httpMethod,
    path: fullPath,
    methodName: method.getName(),
    controllerName: getControllerName(controller),
    controllerTags: [...getControllerTags(controller)],
    returnType: getReturnTypeInfo(method),
    parameters: extractParameters(method),
    decorators: [...extractDecoratorNames(method)],
    operation: extractApiOperationMetadata(method),
    responses: [...extractApiResponses(method)],
    httpCode: extractHttpCode(method),
    consumes: [...extractApiConsumes(method)],
    produces: [...extractApiProduces(method)],
    security: [...security],
  });
};

export const getControllerMethodInfos = (
  controller: ClassDeclaration,
): readonly MethodInfo[] =>
  controller
    .getMethods()
    .map((method) => getMethodInfo(controller, method))
    .filter(Option.isSome)
    .map((opt) => opt.value);
