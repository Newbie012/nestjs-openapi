import { Effect, Option } from 'effect';
import type {
  MethodDeclaration,
  ClassDeclaration,
  Decorator,
  ParameterDeclaration,
  Symbol as TsSymbol,
} from 'ts-morph';
import { ts } from 'ts-morph';
import type {
  MethodInfo,
  ResolvedParameter,
  ReturnTypeInfo,
  HttpMethod,
  ParameterLocation,
  OperationMetadata,
} from './domain.js';
import {
  getControllerName,
  getControllerTags,
  getHttpDecorator,
} from './controllers.js';
import {
  extractControllerSecurity,
  extractMethodSecurity,
  hasMethodSecurityDecorators,
  combineSecurityRequirements,
} from './security-decorators.js';
import {
  extractPropertyValidationInfo,
  readEnumValues,
} from './validation-mapper.js';
import {
  mergeDeclaredParameters,
  readDeclaredParameters,
} from './parameters.js';
import {
  DEFAULT_ENUM_STYLE,
  DEFAULT_SCHEMA_NAMING,
  type EnumStyle,
} from './property-schema.js';
import { getAwaitedReturnType, resolveDeclarations } from './ast.js';
import type { StaticValue } from './static-value.js';
import { Node } from 'ts-morph';
import {
  getDecoratorNames,
  getEffectiveDecorators,
  type DecoratorCall,
  type DecoratorExpansionOptions,
} from './decorators.js';
import { extractRequestBody, extractResponses } from './responses.js';
import { collectReferencedDeclarations } from './declaration-references.js';
import { readStatusCode } from './http-status.js';
import type { OptionsConfig } from './types.js';
import {
  asBoolean,
  asNumber,
  asString,
  asStrings,
  evaluate,
  getProperty,
  toPlain,
  unwrapThunk,
} from './static-value.js';

// Caches for expensive operations to avoid repeated AST traversal
const methodInfoCache = new WeakMap<
  MethodDeclaration,
  Map<string, readonly MethodInfo[]>
>();
const returnTypeInfoCache = new WeakMap<MethodDeclaration, ReturnTypeInfo>();
const parametersCache = new WeakMap<
  MethodDeclaration,
  Map<string, readonly ResolvedParameter[]>
>();

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

/** Configuration options for parameter extraction */
export interface ExtractParametersOptions {
  /** Query parameter handling options */
  readonly query?: {
    /** How to represent query DTOs: "inline" (default) or "ref" */
    readonly style?: 'inline' | 'ref';
  };
  readonly expansion?: DecoratorExpansionOptions;
  readonly enums?: EnumStyle;
  readonly versioning?: VersioningOptions;
}

type VersioningOptions = NonNullable<OptionsConfig['versioning']>;

const expansionIds = new WeakMap<DecoratorExpansionOptions, number>();
let nextExpansionId = 0;

const getExpansionId = (expansion: DecoratorExpansionOptions | undefined) => {
  if (!expansion) return 0;
  let id = expansionIds.get(expansion);
  if (id === undefined) {
    id = ++nextExpansionId;
    expansionIds.set(expansion, id);
  }
  return id;
};

const versioningIds = new WeakMap<VersioningOptions, number>();
const getVersioningId = (versioning: VersioningOptions | undefined) => {
  if (!versioning) return 0;
  let id = versioningIds.get(versioning);
  if (id === undefined) {
    id = ++nextExpansionId;
    versioningIds.set(versioning, id);
  }
  return id;
};

const getExtractParametersOptionsCacheKey = (
  options: ExtractParametersOptions = {},
): string =>
  `${options.query?.style === 'ref' ? 'query:ref' : 'query:inline'}:${options.enums ?? DEFAULT_ENUM_STYLE}:${getExpansionId(options.expansion)}:${getVersioningId(options.versioning)}`;

const getOrCreateMethodOptionsCacheBucket = <T>(
  cache: WeakMap<MethodDeclaration, Map<string, T>>,
  method: MethodDeclaration,
): Map<string, T> => {
  const existing = cache.get(method);
  if (existing) return existing;

  const created = new Map<string, T>();
  cache.set(method, created);
  return created;
};

/** Primitive types that should not be expanded */
const PRIMITIVE_TYPES = new Set([
  'string',
  'number',
  'boolean',
  'any',
  'unknown',
  'void',
  'null',
  'undefined',
  'never',
  'object',
  'String',
  'Number',
  'Boolean',
  'Date',
]);



const parseTypeText = (
  text: string,
): { type: Option.Option<string>; inline: Option.Option<string> } => {
  const trimmed = text.trim();
  return trimmed.startsWith('{') && trimmed.endsWith('}')
    ? { type: Option.none(), inline: Option.some(trimmed) }
    : { type: Option.some(trimmed), inline: Option.none() };
};

const getGenericBaseType = (text: string): string | null => {
  const genericStart = text.indexOf('<');
  return genericStart === -1 ? null : text.slice(0, genericStart).trim();
};

const hasAliasedImportCollision = (
  method: MethodDeclaration,
  exportedName: string,
): boolean => {
  const localNames = new Set<string>();

  for (const importDecl of method.getSourceFile().getImportDeclarations()) {
    for (const namedImport of importDecl.getNamedImports()) {
      const aliasNode = namedImport.getAliasNode();
      if (!aliasNode) continue;
      if (namedImport.getName() !== exportedName) continue;
      localNames.add(aliasNode.getText());
    }
  }

  return localNames.size > 1;
};

const getReturnTypeInfo = (method: MethodDeclaration): ReturnTypeInfo => {
  // Check cache first
  const cached = returnTypeInfoCache.get(method);
  if (cached !== undefined) return cached;

  const awaited = getAwaitedReturnType(method);
  const rawTypeText = awaited.getText(method);

  const symbol = awaited.getSymbol?.();

  // Try to get original name for aliased imports (e.g., "import { Foo as Bar }")
  // This ensures refs match schema names generated from the original export
  const getOriginalTypeName = (): string | null => {
    if (!symbol) return null;
    const aliased = symbol.getAliasedSymbol?.();
    if (aliased) {
      const name = aliased.getName();
      if (name && !name.startsWith('__')) return name;
    }
    return null;
  };

  let text = getOriginalTypeName() ?? rawTypeText;

  // For aliased generic types (e.g. ApiResponse as ApiResponseType),
  // prefer the original exported symbol name so refs match generated schemas.
  const compilerType = awaited.compilerType as {
    aliasSymbol?: {
      escapedName?: string | number | symbol;
      declarations?: ReadonlyArray<{
        getSourceFile: () => { fileName?: string };
      }>;
    };
  };
  const aliasName = compilerType.aliasSymbol?.escapedName?.toString();
  if (aliasName && !aliasName.startsWith('__')) {
    const genericBase = getGenericBaseType(text);
    const shouldPreserveLocalAlias =
      genericBase !== null &&
      genericBase !== aliasName &&
      hasAliasedImportCollision(method, aliasName);

    if (!shouldPreserveLocalAlias) {
      text =
        genericBase === null
          ? aliasName
          : `${aliasName}${text.slice(text.indexOf('<'))}`;
    }
  }

  // Some generic aliases expose the original symbol via getSymbol() instead of
  // compilerType.aliasSymbol. Normalize those as well.
  const symbolName = symbol?.getName();
  if (symbolName && !symbolName.startsWith('__')) {
    const genericBase = getGenericBaseType(text);
    if (genericBase !== null) {
      const shouldPreserveLocalAlias =
        genericBase !== symbolName &&
        hasAliasedImportCollision(method, symbolName);
      if (!shouldPreserveLocalAlias) {
        text = `${symbolName}${text.slice(text.indexOf('<'))}`;
      }
    }
  }

  const promiseMatch = text.match(/^Promise<(.+)>$/);
  if (promiseMatch) text = promiseMatch[1].trim();

  // Clean import(...).TypeName to just TypeName
  text = text.replace(/\bimport\([^)]*\)\./g, '');

  const resolveExternalImportFilePath = (): Option.Option<string> => {
    const importTypeMatch = rawTypeText.match(
      /import\(["']([^"']+)["']\)\.[A-Za-z_$][A-Za-z0-9_$]*/,
    );
    if (importTypeMatch) {
      const moduleSpecifier = importTypeMatch[1]!;
      if (!moduleSpecifier.startsWith('.') && !moduleSpecifier.startsWith('/')) {
        return Option.some(`/node_modules/${moduleSpecifier}/index.d.ts`);
      }
    }

    const namespaceMatch = rawTypeText.match(
      /^([A-Za-z_$][A-Za-z0-9_$]*)\.[A-Za-z_$][A-Za-z0-9_$]*(?:<.*>)?$/,
    );
    if (!namespaceMatch) return Option.none();

    const namespace = namespaceMatch[1]!;
    for (const importDecl of method.getSourceFile().getImportDeclarations()) {
      const namespaceImport = importDecl.getNamespaceImport();
      const defaultImport = importDecl.getDefaultImport();
      const matchesImportAlias =
        namespaceImport?.getText() === namespace ||
        defaultImport?.getText() === namespace;
      if (!matchesImportAlias) {
        continue;
      }

      const moduleSpecifier = importDecl.getModuleSpecifierValue();
      if (moduleSpecifier.startsWith('.') || moduleSpecifier.startsWith('/')) {
        return Option.none();
      }

      return Option.some(`/node_modules/${moduleSpecifier}/index.d.ts`);
    }

    return Option.none();
  };

  const resolveFilePath = (): Option.Option<string> => {
    const aliasDeclFile =
      compilerType.aliasSymbol?.declarations?.[0]?.getSourceFile?.().fileName;
    if (typeof aliasDeclFile === 'string' && aliasDeclFile.length > 0) {
      return Option.some(aliasDeclFile);
    }

    if (symbol) {
      const decls = symbol.getDeclarations();
      if (decls && decls.length > 0) {
        return Option.some(decls[0].getSourceFile().getFilePath());
      }
    }
    const externalImportPath = resolveExternalImportFilePath();
    if (Option.isSome(externalImportPath)) {
      return externalImportPath;
    }
    return Option.none();
  };

  let result: ReturnTypeInfo;
  if (text.endsWith('[]')) {
    const baseType = text.slice(0, -2);
    const base = parseTypeText(baseType);
    result = {
      ...base,
      container: Option.some('array' as const),
      filePath: Option.isSome(base.type) ? resolveFilePath() : Option.none(),
    };
  } else {
    const arrayMatch = text.match(/^(?:Readonly)?Array<(.+)>$/);
    if (arrayMatch) {
      const base = parseTypeText(arrayMatch[1]);
      result = {
        ...base,
        container: Option.some('array' as const),
        filePath: Option.isSome(base.type) ? resolveFilePath() : Option.none(),
      };
    } else {
      const parsed = parseTypeText(text);
      result = {
        ...parsed,
        container: Option.none(),
        filePath: Option.isSome(parsed.type)
          ? resolveFilePath()
          : Option.none(),
      };
    }
  }

  returnTypeInfoCache.set(method, result);
  return result;
};

const readDescription = (call: DecoratorCall): Option.Option<string> =>
  Option.fromNullable(asString(getProperty(call.args[0], 'description')));

const findDescriptionByName = (
  calls: readonly DecoratorCall[],
  decoratorName: string,
  paramName: string,
): Option.Option<string> => {
  for (const call of calls) {
    if (call.name !== decoratorName) continue;
    if (asString(getProperty(call.args[0], 'name')) !== paramName) continue;
    const description = readDescription(call);
    if (Option.isSome(description)) return description;
  }
  return Option.none();
};

const API_PARAMETER_DECORATORS = new Set([
  'ApiQuery',
  'ApiParam',
  'ApiBody',
  'ApiHeader',
]);

const API_PARAMETER_DECORATOR_BY_LOCATION: Record<string, string> = {
  query: 'ApiQuery',
  path: 'ApiParam',
  header: 'ApiHeader',
  body: 'ApiBody',
};

/** Checks param-level decorators first, then method-level @ApiQuery/@ApiParam */
const extractParameterDescription = (
  method: MethodDeclaration,
  param: ParameterDeclaration,
  paramName: string,
  paramLocation: ParameterLocation,
  expansion: DecoratorExpansionOptions | undefined,
): Option.Option<string> => {
  for (const call of getEffectiveDecorators(param, expansion)) {
    if (!API_PARAMETER_DECORATORS.has(call.name)) continue;
    const description = readDescription(call);
    if (Option.isSome(description)) return description;
  }

  const decoratorName = API_PARAMETER_DECORATOR_BY_LOCATION[paramLocation];
  return decoratorName
    ? findDescriptionByName(
        getEffectiveDecorators(method, expansion),
        decoratorName,
        paramName,
      )
    : Option.none();
};

/** Built-in utility types that need full generic signature preserved */
const BUILT_IN_TYPES = new Set([
  'Array',
  'ReadonlyArray',
  'Promise',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'Record',
  'Partial',
  'Required',
  'Pick',
  'Omit',
  'Exclude',
  'Extract',
  'NonNullable',
  'ReturnType',
  'InstanceType',
  'Parameters',
]);

/** Check if a type is a class/interface that can be expanded */
const isExpandableType = (typeName: string): boolean => {
  // Primitives and built-ins should not be expanded
  if (PRIMITIVE_TYPES.has(typeName)) return false;
  if (BUILT_IN_TYPES.has(typeName.split('<')[0])) return false;
  // Union types, intersection types, etc. should not be expanded
  if (typeName.includes(' | ') || typeName.includes(' & ')) return false;
  // Array types should not be expanded
  if (typeName.endsWith('[]')) return false;
  // Expand named class/interface types (PascalCase or camelCase)
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(typeName);
};

/** Convert TypeScript type to simpler type string for OpenAPI */
const tsTypeToString = (typeText: string): string => {
  const trimmed = typeText.trim();
  // Handle common types
  if (trimmed === 'string' || trimmed === 'String') return 'string';
  if (trimmed === 'number' || trimmed === 'Number') return 'number';
  if (trimmed === 'boolean' || trimmed === 'Boolean') return 'boolean';
  if (trimmed === 'Date') return 'Date';
  // For union with undefined, extract the non-undefined type
  if (trimmed.includes(' | undefined')) {
    return trimmed.replace(' | undefined', '').trim();
  }
  return trimmed;
};

const hasUndefinedTypeMember = (typeText: string): boolean =>
  typeText.split('|').some((member) => member.trim() === 'undefined');

const isInlineObjectTypeText = (typeText: string): boolean => {
  const trimmed = typeText.trim();
  return trimmed.startsWith('{') && trimmed.endsWith('}');
};

/** Extract class properties as individual query parameters */
const expandQueryDtoProperties = (
  method: MethodDeclaration,
  paramType: ReturnType<ParameterDeclaration['getType']>,
  expansion: DecoratorExpansionOptions | undefined,
): ResolvedParameter[] => {
  const expandedParams: ResolvedParameter[] = [];
  const properties = paramType.getProperties();

  for (const prop of properties) {
    const propName = prop.getName();
    // Skip internal properties
    if (propName.startsWith('_')) continue;

    // Get property type from declarations
    const declarations = prop.getDeclarations();
    let propTypeText = 'unknown';
    let isOptional = false;
    let constraints: ResolvedParameter['constraints'] = undefined;

    if (declarations.length > 0) {
      const decl = declarations[0];
      // Check if property declaration (class property with decorators)
      const propDecl = decl.asKind?.(ts.SyntaxKind.PropertyDeclaration);
      // Check if property signature (interface property)
      const propSig = decl.asKind?.(ts.SyntaxKind.PropertySignature);

      if (propDecl) {
        const rawPropTypeText = propDecl.getType().getText(propDecl);
        const declaredPropTypeText =
          propDecl.getTypeNode()?.getText() ?? rawPropTypeText;
        propTypeText = tsTypeToString(rawPropTypeText);
        const hasUndefinedUnion = hasUndefinedTypeMember(declaredPropTypeText);
        const isInlineObjectType =
          propDecl.getTypeNode()?.getKind() === ts.SyntaxKind.TypeLiteral ||
          isInlineObjectTypeText(declaredPropTypeText);

        // Extract optionality and constraints in a single pass for performance
        const validationInfo = extractPropertyValidationInfo(
          propDecl,
          expansion,
        );

        // Check for optionality: ? token, initializer, OR @IsOptional() decorator
        isOptional =
          propDecl.hasQuestionToken() ||
          propDecl.hasInitializer?.() ||
          validationInfo.isOptional ||
          hasUndefinedUnion ||
          isInlineObjectType;

        // Use extracted validation constraints
        if (Object.keys(validationInfo.constraints).length > 0) {
          constraints = validationInfo.constraints;
        }
      } else if (propSig) {
        const rawPropTypeText = propSig.getType().getText(propSig);
        const declaredPropTypeText =
          propSig.getTypeNode()?.getText() ?? rawPropTypeText;
        propTypeText = tsTypeToString(rawPropTypeText);
        const hasUndefinedUnion = hasUndefinedTypeMember(declaredPropTypeText);
        const isInlineObjectType =
          propSig.getTypeNode()?.getKind() === ts.SyntaxKind.TypeLiteral ||
          isInlineObjectTypeText(declaredPropTypeText);
        isOptional =
          propSig.hasQuestionToken() || hasUndefinedUnion || isInlineObjectType;
        // Interface properties don't have decorators, so no constraints to extract
      }
    }

    // Try to get description from @ApiQuery decorators on the method
    const description = findDescriptionByName(
      getEffectiveDecorators(method, expansion),
      'ApiQuery',
      propName,
    );

    expandedParams.push({
      name: propName,
      location: 'query',
      tsType: propTypeText,
      required: !isOptional,
      description,
      constraints,
    });
  }

  return expandedParams;
};

/**
 * Resolves the name of the enum that declares a type symbol.
 *
 * TypeScript collapses the declared type of a single-member enum to that
 * member's literal type, so the type's symbol is the enum member (`Email`)
 * rather than the enum (`Channel`). Walking up to the enum declaration keeps
 * schema refs pointing at the enum name, which is what actually gets emitted.
 */
const getDeclaringEnumName = (symbol: TsSymbol): string | undefined => {
  for (const declaration of symbol.getDeclarations()) {
    const enumName = declaration
      .asKind?.(ts.SyntaxKind.EnumMember)
      ?.getParent()
      .getName();
    if (enumName) return enumName;
  }
  return undefined;
};

const extractParameters = (
  method: MethodDeclaration,
  options: ExtractParametersOptions = {},
): readonly ResolvedParameter[] => {
  // Cache by extraction options, since query style changes output shape.
  const optionsKey = getExtractParametersOptionsCacheKey(options);
  const cached = parametersCache.get(method)?.get(optionsKey);
  if (cached !== undefined) return cached;

  const result = method
    .getParameters()
    .reduce<ResolvedParameter[]>((params, param) => {
      const relevantDecorator = param
        .getDecorators()
        .find((d) => d.getName() in PARAMETER_DECORATOR_MAP);

      if (!relevantDecorator) return params;

      const decoratorName = relevantDecorator.getName();
      const args = relevantDecorator.getArguments();

      let paramName = param.getName();
      let hasExplicitName = false;
      for (const arg of args) {
        const stringLit = arg.asKind?.(ts.SyntaxKind.StringLiteral);
        if (stringLit) {
          paramName = stringLit.getLiteralValue();
          hasExplicitName = true;
          break;
        }
      }

      const location = PARAMETER_DECORATOR_MAP[decoratorName] ?? 'query';
      if (decoratorName === 'Headers' && !hasExplicitName) return params;
      const paramType = param.getType();

      // Get type name, preferring symbol name for correct resolution of aliased imports
      // When someone writes "import { Foo as Bar }", getText() returns "Bar" but
      // symbol.getName() returns "Foo" (the original export name)
      const rawTsType = paramType.getText(param);
      const declaredTsType = param.getTypeNode()?.getText() ?? rawTsType;
      let tsType = rawTsType;
      const symbol = paramType.getSymbol?.();
      if (symbol) {
        const symbolName = getDeclaringEnumName(symbol) ?? symbol.getName();
        // Use symbol name if it's a valid identifier (not __type etc.)
        // But skip built-in types like Array, Promise, etc. - those should use getText()
        // to preserve the full generic signature like "Array<string>"
        if (
          symbolName &&
          !symbolName.startsWith('__') &&
          !BUILT_IN_TYPES.has(symbolName)
        ) {
          tsType = symbolName;
        }
      }

      // Clean import(...).TypeName to just TypeName (for cases where getText returns full path)
      tsType = tsType.replace(/\bimport\([^)]*\)\./g, '');

      // Check if we should expand query DTO to individual parameters
      // Conditions: @Query() without explicit name, type is a class, style is not "ref"
      if (
        decoratorName === 'Query' &&
        !hasExplicitName &&
        options.query?.style !== 'ref' &&
        isExpandableType(tsType)
      ) {
        // Expand DTO properties to individual query parameters
        const expandedParams = expandQueryDtoProperties(
          method,
          paramType,
          options.expansion,
        );
        if (expandedParams.length > 0) {
          params.push(...expandedParams);
          return params;
        }
        // If expansion failed (no properties found), fall through to default behavior
      }

      const isOptional =
        location !== 'path' &&
        (param.hasQuestionToken() ||
          param.hasInitializer() ||
          hasUndefinedTypeMember(declaredTsType));
      const description = extractParameterDescription(
        method,
        param,
        paramName,
        location,
        options.expansion,
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

  getOrCreateMethodOptionsCacheBucket(parametersCache, method).set(
    optionsKey,
    result,
  );
  return result;
};

/** Extracts all decorator names from a controller and method */
const extractDecoratorNames = (
  controller: ClassDeclaration,
  method: MethodDeclaration,
  expansion: DecoratorExpansionOptions | undefined,
): readonly string[] => [
  ...getDecoratorNames(controller, expansion),
  ...getDecoratorNames(method, expansion),
];

const readStringArguments = (
  calls: readonly DecoratorCall[],
  name: string,
): readonly string[] =>
  calls
    .filter((call) => call.name === name)
    .flatMap((call) => asStrings(call.args));

// As in @nestjs/swagger, the controller's and the method's are combined
const extractContentTypes = (
  controllerCalls: readonly DecoratorCall[],
  methodCalls: readonly DecoratorCall[],
  name: 'ApiConsumes' | 'ApiProduces',
): readonly string[] => [
  ...new Set([
    ...readStringArguments(controllerCalls, name),
    ...readStringArguments(methodCalls, name),
  ]),
];

/** Extracts @HttpCode decorator value */
const extractHttpCode = (
  methodCalls: readonly DecoratorCall[],
): Option.Option<number> => {
  const call = methodCalls.find((candidate) => candidate.name === 'HttpCode');
  const status = readStatusCode(call?.args[0]);
  return typeof status === 'number' ? Option.some(status) : Option.none();
};

/** Extracts metadata from @ApiOperation decorator */
const extractApiOperationMetadata = (
  methodCalls: readonly DecoratorCall[],
): OperationMetadata => {
  const options = methodCalls.find((call) => call.name === 'ApiOperation')
    ?.args[0];
  return {
    summary: Option.fromNullable(asString(getProperty(options, 'summary'))),
    description: Option.fromNullable(
      asString(getProperty(options, 'description')),
    ),
    operationId: Option.fromNullable(
      asString(getProperty(options, 'operationId')),
    ),
    deprecated: Option.fromNullable(
      asBoolean(getProperty(options, 'deprecated')),
    ),
  };
};

const hasExcludeDecorator = (
  calls: readonly DecoratorCall[],
  name: 'ApiExcludeEndpoint' | 'ApiExcludeController',
) =>
  calls.some((call) => call.name === name && asBoolean(call.args[0]) !== false);

const expandDeclaredQueryType = (
  method: MethodDeclaration,
  type: StaticValue,
  expansion: DecoratorExpansionOptions | undefined,
): readonly ResolvedParameter[] => {
  if (type.kind !== 'reference' || !type.node) return [];
  const classDecl = resolveDeclarations(type.node).find(
    (declaration) =>
      Node.isClassDeclaration(declaration) ||
      Node.isInterfaceDeclaration(declaration),
  );
  if (!classDecl) return [];
  return expandQueryDtoProperties(method, classDecl.getType(), expansion);
};

// Method-level @ApiTags add to the controller's, as in @nestjs/swagger
const extractTags = (
  controller: ClassDeclaration,
  methodCalls: readonly DecoratorCall[],
  expansion: DecoratorExpansionOptions | undefined,
): readonly string[] => [
  ...new Set([
    ...getControllerTags(controller, expansion),
    ...readStringArguments(methodCalls, 'ApiTags'),
  ]),
];

const readPathList = (value: StaticValue | undefined): readonly string[] => {
  if (value?.kind !== 'array') return [asString(value) ?? ''];
  const paths = asStrings(value.items);
  return paths.length > 0 ? paths : [''];
};

const readControllerPaths = (controllerCalls: readonly DecoratorCall[]) => {
  const options = controllerCalls.find((call) => call.name === 'Controller')
    ?.args[0];
  return readPathList(
    options?.kind === 'object' ? options.properties['path'] : options,
  );
};

const VERSION_NEUTRAL: unique symbol = Symbol('VERSION_NEUTRAL');
type Version = string | typeof VERSION_NEUTRAL;

const readVersion = (value: StaticValue | undefined): readonly Version[] | undefined => {
  const unwrapped = unwrapThunk(value);
  if (!unwrapped) return undefined;
  if (unwrapped.kind === 'array') {
    return unwrapped.items.flatMap((item) => readVersion(item) ?? []);
  }
  if (unwrapped.kind === 'reference' && unwrapped.name === 'VERSION_NEUTRAL') {
    return [VERSION_NEUTRAL];
  }
  const text = asString(unwrapped) ?? asNumber(unwrapped)?.toString();
  return text === undefined ? undefined : [text];
};

const fromConfigVersion = (value: VersioningOptions['defaultVersion']) => {
  if (value === undefined) return undefined;
  const list = (Array.isArray(value) ? value : [value]) as readonly (string | symbol)[];
  return list.map((version) =>
    typeof version === 'symbol' ? VERSION_NEUTRAL : version,
  );
};

const joinPaths = (...fragments: readonly string[]) => {
  const joined = fragments
    .map((fragment) => fragment.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
  return `/${joined}`.replace(/\/+/g, '/');
};

// One path per version (URI versioning) and per controller and method path,
// as Nest's RoutePathFactory builds them, with the `methodKey` of
// @nestjs/swagger's default operationId: `findAll`, `findAll[1]`, `findAll_v1`
const getRouteVariants = (
  methodName: string,
  controllerCalls: readonly DecoratorCall[],
  methodCalls: readonly DecoratorCall[],
  httpDecorator: Decorator,
  versioning: VersioningOptions | undefined,
) => {
  const isUri = versioning?.type === 'uri';
  const controllerOptions = controllerCalls.find(
    (call) => call.name === 'Controller',
  )?.args[0];
  const versions =
    readVersion(methodCalls.find((call) => call.name === 'Version')?.args[0]) ??
    readVersion(
      controllerOptions?.kind === 'object'
        ? controllerOptions.properties['version']
        : undefined,
    ) ??
    fromConfigVersion(versioning?.defaultVersion);

  const prefix =
    versioning?.prefix === false ? '' : (versioning?.prefix ?? 'v');
  const versionSegments: readonly string[] =
    isUri && versions
      ? versions.map((version) =>
          version === VERSION_NEUTRAL ? '' : `${prefix}${version}`,
        )
      : [''];
  const pathVersions = versionSegments.filter(Boolean);

  const methodPaths = readPathList(
    httpDecorator.getArguments()[0]
      ? evaluate(httpDecorator.getArguments()[0]!)
      : undefined,
  );
  const paths = versionSegments.flatMap((versionSegment) =>
    readControllerPaths(controllerCalls).flatMap((controllerPath) =>
      methodPaths.map((methodPath) =>
        joinPaths(versionSegment, controllerPath, methodPath),
      ),
    ),
  );

  const isAlias = paths.length > 1 && paths.length !== pathVersions.length;
  return paths.map((path, index) => {
    const pathVersion = pathVersions.find(
      (version) => path.includes(`/${version}/`) || path.endsWith(`/${version}`),
    );
    const methodKey = isAlias ? `${methodName}[${index}]` : methodName;
    return {
      path,
      operationKey: pathVersion ? `${methodKey}_${pathVersion}` : methodKey,
    };
  });
};

// `@All()` documents every method, as @nestjs/swagger does
const ALL_METHODS: readonly HttpMethod[] = [
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
  'OPTIONS',
  'HEAD',
];

const getMethodInfoVariants = (
  controller: ClassDeclaration,
  method: MethodDeclaration,
  options: ExtractParametersOptions = {},
): readonly MethodInfo[] => {
  // Cache by extraction options, since query style can change parameter output.
  const optionsKey = getExtractParametersOptionsCacheKey(options);
  const cached = methodInfoCache.get(method)?.get(optionsKey);
  if (cached !== undefined) return cached;

  const remember = (variants: readonly MethodInfo[]) => {
    getOrCreateMethodOptionsCacheBucket(methodInfoCache, method).set(
      optionsKey,
      variants,
    );
    return variants;
  };

  const httpDecorator = getHttpDecorator(method);
  if (!httpDecorator) return remember([]);

  const decoratorName = httpDecorator.getName();
  const httpMethod = HTTP_METHOD_MAP[decoratorName];
  if (!httpMethod) return remember([]);

  const expansion = options.expansion;
  const controllerCalls = getEffectiveDecorators(controller, expansion);
  const methodCalls = getEffectiveDecorators(method, expansion);
  const routes = getRouteVariants(
    method.getName(),
    controllerCalls,
    methodCalls,
    httpDecorator,
    options.versioning,
  );

  // Extract security requirements from controller and method decorators
  const controllerSecurity = extractControllerSecurity(controller, expansion);
  const methodSecurity = extractMethodSecurity(method, expansion);
  const hasMethodSecurity = hasMethodSecurityDecorators(method, expansion);
  const security = combineSecurityRequirements(
    controllerSecurity,
    methodSecurity,
    hasMethodSecurity,
  );

  const requestBody = extractRequestBody(methodCalls);

  const base = {
    httpMethod,
    path: routes[0]!.path,
    methodName: method.getName(),
    controllerName: getControllerName(controller),
    controllerFile: controller.getSourceFile().getFilePath(),
    controllerTags: [...extractTags(controller, methodCalls, expansion)],
    returnType: getReturnTypeInfo(method),
    parameters: [
      ...mergeDeclaredParameters(
        extractParameters(method, options),
        readDeclaredParameters(controllerCalls, methodCalls, readEnumValues, {
          ...DEFAULT_SCHEMA_NAMING,
          enums: options.enums ?? DEFAULT_ENUM_STYLE,
        }),
        (type) => expandDeclaredQueryType(method, type, expansion),
      ),
    ],
    decorators: [...extractDecoratorNames(controller, method, expansion)],
    excluded:
      hasExcludeDecorator(controllerCalls, 'ApiExcludeController') ||
      hasExcludeDecorator(methodCalls, 'ApiExcludeEndpoint'),
    operation: extractApiOperationMetadata(methodCalls),
    responses: [...extractResponses(controllerCalls, methodCalls)],
    ...(requestBody ? { requestBody } : {}),
    referencedDeclarations: [
      ...collectReferencedDeclarations(
        method,
        [...controllerCalls, ...methodCalls],
        expansion,
      ),
    ],
    httpCode: extractHttpCode(methodCalls),
    consumes: [
      ...extractContentTypes(controllerCalls, methodCalls, 'ApiConsumes'),
    ],
    produces: [
      ...extractContentTypes(controllerCalls, methodCalls, 'ApiProduces'),
    ],
    security: [...security],
    extensions: extractExtensions(controllerCalls, methodCalls),
    extraModels: [
      ...readExtraModelNames(controllerCalls),
      ...readExtraModelNames(methodCalls),
    ],
  } satisfies MethodInfo;

  return remember(
    routes.flatMap((route) =>
      (httpMethod === 'ALL' ? ALL_METHODS : [httpMethod]).map((verb) => ({
        ...base,
        httpMethod: verb,
        path: route.path,
        // @nestjs/swagger names @All() operations after the bare method name
        operationKey:
          httpMethod === 'ALL'
            ? `${method.getName()}_${verb.toLowerCase()}`
            : route.operationKey,
      })),
    ),
  );
};

const getMethodInfoInternal = (
  controller: ClassDeclaration,
  method: MethodDeclaration,
  options: ExtractParametersOptions = {},
): Option.Option<MethodInfo> =>
  Option.fromNullable(getMethodInfoVariants(controller, method, options)[0]);

// @nestjs/swagger only reads @ApiExtension on methods; on a controller it
// applies to all its methods, the method's own winning
const extractExtensions = (
  controllerCalls: readonly DecoratorCall[],
  methodCalls: readonly DecoratorCall[],
) =>
  Object.fromEntries(
    [...controllerCalls, ...methodCalls].flatMap((call) => {
      if (call.name !== 'ApiExtension') return [];
      const key = asString(call.args[0]);
      return key?.startsWith('x-') && call.args[1]
        ? [[key, toPlain(call.args[1])]]
        : [];
    }),
  );

const readExtraModelNames = (calls: readonly DecoratorCall[]) =>
  calls
    .filter((call) => call.name === 'ApiExtraModels')
    .flatMap((call) =>
      call.args.flatMap((arg) => {
        const unwrapped = unwrapThunk(arg);
        return unwrapped?.kind === 'reference' ? [unwrapped.name] : [];
      }),
    );

export const getMethodInfo = (
  controller: ClassDeclaration,
  method: MethodDeclaration,
  options: ExtractParametersOptions = {},
): Option.Option<MethodInfo> =>
  getMethodInfoInternal(controller, method, options);

export const getMethodInfoEffect = Effect.fn('Methods.getMethodInfo')(
  function* (
    controller: ClassDeclaration,
    method: MethodDeclaration,
    options: ExtractParametersOptions = {},
  ) {
    return yield* Effect.succeed(
      getMethodInfoInternal(controller, method, options),
    );
  },
);

export const getControllerMethodInfos = (
  controller: ClassDeclaration,
  options: ExtractParametersOptions = {},
): readonly MethodInfo[] =>
  controller
    .getMethods()
    .flatMap((method) => getMethodInfoVariants(controller, method, options));

export const getControllerMethodInfosEffect = Effect.fn(
  'Methods.getControllerMethodInfos',
)(function* (
  controller: ClassDeclaration,
  options: ExtractParametersOptions = {},
) {
  return yield* Effect.sync(() => getControllerMethodInfos(controller, options));
});

const serviceGetMethodInfo = Effect.fn('MethodExtractionService.getMethodInfo')(
  function* (
    controller: ClassDeclaration,
    method: MethodDeclaration,
    options: ExtractParametersOptions = {},
  ) {
    return yield* getMethodInfoEffect(controller, method, options);
  },
);

const serviceGetControllerMethodInfos = Effect.fn(
  'MethodExtractionService.getControllerMethodInfos',
)(function* (
  controller: ClassDeclaration,
  options: ExtractParametersOptions = {},
) {
  return yield* getControllerMethodInfosEffect(controller, options);
});

export class MethodExtractionService extends Effect.Service<MethodExtractionService>()(
  'MethodExtractionService',
  {
    accessors: true,
    effect: Effect.succeed({
      getMethodInfo: serviceGetMethodInfo,
      getControllerMethodInfos: serviceGetControllerMethodInfos,
    }),
  },
) {}
