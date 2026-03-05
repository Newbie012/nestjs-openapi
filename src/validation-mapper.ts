/**
 * Validation Mapper - Maps class-validator decorators to OpenAPI constraints
 *
 * This module extracts validation information from class-validator decorators
 * in TypeScript source files and applies them to JSON Schema definitions.
 */

import { Effect, Option } from 'effect';
import type {
  ClassDeclaration,
  Decorator,
  EnumDeclaration,
  Identifier,
  ObjectLiteralExpression,
  PropertyDeclaration,
} from 'ts-morph';
import { Node, ts } from 'ts-morph';
import type { GeneratedSchemas, JsonSchema } from './schema-generator.js';
import { ValidationMappingError } from './errors.js';

// Validation constraint types

export interface ValidationConstraints {
  // String constraints
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly format?: string;

  // Number constraints
  readonly minimum?: number;
  readonly maximum?: number;
  readonly exclusiveMinimum?: number | boolean;
  readonly exclusiveMaximum?: number | boolean;
  readonly multipleOf?: number;

  // Array constraints
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly uniqueItems?: boolean;

  // Enum constraint
  readonly enum?: readonly unknown[];

  // Type override
  readonly type?: string;

  // Schema metadata (from @ApiProperty)
  readonly description?: string;
  readonly title?: string;
  readonly example?: unknown;
  readonly default?: unknown;
  readonly deprecated?: boolean;
  readonly readOnly?: boolean;
  readonly writeOnly?: boolean;
  readonly nullable?: boolean;
  readonly isArray?: boolean;

  // Visibility (from @ApiHideProperty)
  readonly hidden?: boolean;
}

/**
 * Result of extracting property validation info in a single pass
 */
export interface PropertyValidationInfo {
  readonly isOptional: boolean;
  readonly constraints: ValidationConstraints;
}

/**
 * Result of extracting validation metadata from an entire class.
 * Collected in a single pass over properties.
 */
export interface ClassValidationInfo {
  readonly constraints: Record<string, ValidationConstraints>;
  readonly required: readonly string[];
}

type EnumValue = string | number;
type DecoratorMapper = (
  args: readonly string[],
) => Partial<ValidationConstraints>;
type DecoratorHandler = (
  state: PropertyValidationInfo,
  decorator: Decorator,
) => PropertyValidationInfo;

type EnumExtractionState = {
  readonly values: readonly EnumValue[];
  readonly nextValue: number;
};

/**
 * Get the name of a decorator
 */
const getDecoratorName = (decorator: Decorator): Option.Option<string> =>
  Option.fromNullable(decorator.getCallExpression()).pipe(
    Option.match({
      onNone: () => Option.fromNullable(decorator.getName()),
      onSome: (callExpr) => {
        const expression = callExpr.getExpression();
        return expression.getKind() === ts.SyntaxKind.Identifier
          ? Option.some(expression.getText())
          : Option.none();
      },
    }),
  );

/**
 * Parse a string to a number, returning undefined if invalid
 */
const parseNumber = (value: string | undefined): number | undefined => {
  const parsed = value === undefined ? Number.NaN : Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

/**
 * Mapping from class-validator decorators to OpenAPI constraints
 */
const DECORATOR_MAPPINGS: Record<string, DecoratorMapper> = {
  // Type validators
  IsString: () => ({ type: 'string' }),
  IsNumber: () => ({ type: 'number' }),
  IsInt: () => ({ type: 'integer' }),
  IsBoolean: () => ({ type: 'boolean' }),
  IsArray: () => ({ type: 'array' }),
  IsObject: () => ({ type: 'object' }),
  IsDate: () => ({ type: 'string', format: 'date-time' }),

  // String format validators
  IsEmail: () => ({ format: 'email' }),
  IsUrl: () => ({ format: 'uri' }),
  IsUUID: () => ({ format: 'uuid' }),
  IsDateString: () => ({ format: 'date-time' }),
  IsISO8601: () => ({ format: 'date-time' }),
  IsPhoneNumber: () => ({ format: 'phone' }),
  IsCreditCard: () => ({ format: 'credit-card' }),
  IsIP: () => ({ format: 'ipv4' }),
  IsJSON: () => ({ format: 'json' }),

  // String length validators
  MinLength: (args) => ({ minLength: parseNumber(args[0]) }),
  MaxLength: (args) => ({ maxLength: parseNumber(args[0]) }),
  Length: (args) => ({
    minLength: parseNumber(args[0]),
    maxLength: parseNumber(args[1]) ?? parseNumber(args[0]),
  }),

  // String pattern validators
  Matches: (args) => ({
    pattern:
      args[0] === undefined
        ? undefined
        : args[0].replace(/^\/(.*)\/[gimsuvy]*$/, '$1'),
  }),

  // Number validators
  Min: (args) => ({ minimum: parseNumber(args[0]) }),
  Max: (args) => ({ maximum: parseNumber(args[0]) }),
  IsPositive: () => ({ exclusiveMinimum: 0 }),
  IsNegative: () => ({ exclusiveMaximum: 0 }),

  // Array validators
  ArrayMinSize: (args) => ({ minItems: parseNumber(args[0]) }),
  ArrayMaxSize: (args) => ({ maxItems: parseNumber(args[0]) }),

  // Enum validator - static analysis can't easily extract enum values
  IsEnum: () => ({}),

  // Other validators (these don't map directly to OpenAPI but inform the schema)
  IsOptional: () => ({}), // Handled separately via required array
  IsNotEmpty: () => ({ minLength: 1 }),
  IsDefined: () => ({}),
  IsEmpty: () => ({}),

  // Nested/type validators
  ValidateNested: () => ({}),
  Type: () => ({}),
};

/** Extract text arguments from a decorator's call expression */
const getDecoratorArgs = (decorator: Decorator): readonly string[] =>
  decorator
    .getCallExpression()
    ?.getArguments()
    .map((arg) => arg.getText()) ?? [];

/**
 * Extract enum values from a TypeScript enum declaration
 */
const resolveEnumMemberValue = (
  initializerText: string,
  nextValue: number,
): { readonly value: EnumValue; readonly nextValue: number } => {
  const numericValue = parseNumber(initializerText);
  return numericValue === undefined
    ? { value: initializerText, nextValue }
    : { value: numericValue, nextValue: numericValue + 1 };
};

const extractEnumValues = (enumDecl: EnumDeclaration): readonly EnumValue[] =>
  enumDecl.getMembers().reduce<EnumExtractionState>(
    (state, member) => {
      const initializer = member.getInitializer();

      if (!initializer) {
        return {
          values: [...state.values, state.nextValue],
          nextValue: state.nextValue + 1,
        };
      }

      const stringLiteral = initializer.asKind?.(ts.SyntaxKind.StringLiteral);
      if (stringLiteral) {
        return {
          values: [...state.values, stringLiteral.getLiteralValue()],
          nextValue: state.nextValue,
        };
      }

      const numericLiteral = initializer.asKind?.(ts.SyntaxKind.NumericLiteral);
      if (numericLiteral) {
        const numericValue = numericLiteral.getLiteralValue();
        return {
          values: [...state.values, numericValue],
          nextValue: numericValue + 1,
        };
      }

      const resolved = resolveEnumMemberValue(
        initializer.getText(),
        state.nextValue,
      );

      return {
        values: [...state.values, resolved.value],
        nextValue: resolved.nextValue,
      };
    },
    {
      values: [],
      nextValue: 0,
    },
  ).values;

/**
 * Resolve an enum declaration from an identifier
 */
const resolveEnumFromIdentifier = (
  identifier: Identifier,
): readonly EnumValue[] | undefined => {
  const symbol = identifier.getSymbol();
  if (!symbol) return undefined;

  const declarations = symbol.getDeclarations();
  if (!declarations || declarations.length === 0) return undefined;

  const directEnumDecl = declarations.find((decl): decl is EnumDeclaration =>
    Node.isEnumDeclaration(decl),
  );
  if (directEnumDecl) {
    return extractEnumValues(directEnumDecl);
  }

  const importedEnumDecl = declarations
    .filter(Node.isImportSpecifier)
    .flatMap(
      (decl) => decl.getSymbol()?.getAliasedSymbol()?.getDeclarations() ?? [],
    )
    .find((decl): decl is EnumDeclaration => Node.isEnumDeclaration(decl));

  return importedEnumDecl ? extractEnumValues(importedEnumDecl) : undefined;
};

/**
 * Resolve an enum from a decorator argument like @IsEnum(MyEnum)
 */
const resolveEnumFromDecorator = (
  decorator: Decorator,
): readonly EnumValue[] | undefined => {
  const firstArg = decorator.getCallExpression()?.getArguments()?.[0];
  return firstArg && Node.isIdentifier(firstArg)
    ? resolveEnumFromIdentifier(firstArg)
    : undefined;
};

/** Read a property assignment initializer */
const getPropertyInitializer = (
  objLit: ObjectLiteralExpression,
  name: string,
) =>
  objLit
    .getProperty(name)
    ?.asKind?.(ts.SyntaxKind.PropertyAssignment)
    ?.getInitializer();

/** Read a string literal value from a property assignment */
const getStringProp = (
  objLit: ObjectLiteralExpression,
  name: string,
): string | undefined =>
  getPropertyInitializer(objLit, name)
    ?.asKind?.(ts.SyntaxKind.StringLiteral)
    ?.getLiteralValue();

/** Read a numeric literal value from a property assignment */
const getNumericProp = (
  objLit: ObjectLiteralExpression,
  name: string,
): number | undefined => {
  const initializer = getPropertyInitializer(objLit, name);

  const numericLiteral = initializer?.asKind?.(ts.SyntaxKind.NumericLiteral);
  if (numericLiteral) return numericLiteral.getLiteralValue();

  return initializer && Node.isPrefixUnaryExpression(initializer)
    ? parseNumber(initializer.getText())
    : undefined;
};

/** Read a boolean literal value from a property assignment */
const getBooleanProp = (
  objLit: ObjectLiteralExpression,
  name: string,
): boolean | undefined => {
  const text = getPropertyInitializer(objLit, name)?.getText();
  return text === 'true' ? true : text === 'false' ? false : undefined;
};

/** Read a primitive value (string, number, boolean, null) from an initializer */
const getPrimitiveValue = (
  objLit: ObjectLiteralExpression,
  name: string,
): unknown => {
  const initializer = getPropertyInitializer(objLit, name);
  if (!initializer) return undefined;

  if (Node.isStringLiteral(initializer) || Node.isNumericLiteral(initializer)) {
    return initializer.getLiteralValue();
  }

  const primitiveLiterals: Record<string, boolean | null> = {
    true: true,
    false: false,
    null: null,
  };

  return primitiveLiterals[initializer.getText()];
};

const API_STRING_KEYS = ['description', 'title', 'format', 'pattern'] as const;
const API_NUMBER_KEYS = [
  'minimum',
  'maximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
] as const;
const API_BOOLEAN_KEYS = [
  'exclusiveMinimum',
  'exclusiveMaximum',
  'uniqueItems',
  'deprecated',
  'readOnly',
  'writeOnly',
  'nullable',
  'isArray',
] as const;
const API_PRIMITIVE_KEYS = ['example', 'default'] as const;

const buildConstraintsFromKeys = <K extends keyof ValidationConstraints>(
  objectLiteral: ObjectLiteralExpression,
  keys: readonly K[],
  read: (
    objectLiteral: ObjectLiteralExpression,
    key: K,
  ) => ValidationConstraints[K] | undefined,
): Partial<ValidationConstraints> =>
  Object.fromEntries(
    keys.flatMap((key) => {
      const value = read(objectLiteral, key);
      return value === undefined ? [] : ([[key, value]] as const);
    }),
  ) as Partial<ValidationConstraints>;

/**
 * Extract enum values from @ApiProperty({ enum: ... })
 */
const extractApiPropertyEnum = (
  objLit: ObjectLiteralExpression,
): readonly EnumValue[] | undefined => {
  const initializer = getPropertyInitializer(objLit, 'enum');
  if (!initializer) return undefined;

  const arrayLiteral = initializer.asKind?.(
    ts.SyntaxKind.ArrayLiteralExpression,
  );
  if (arrayLiteral) {
    const values = arrayLiteral
      .getElements()
      .reduce<readonly EnumValue[]>((acc, element) => {
        if (Node.isStringLiteral(element)) {
          return [...acc, element.getLiteralValue()];
        }
        if (Node.isNumericLiteral(element)) {
          return [...acc, element.getLiteralValue()];
        }
        if (Node.isPrefixUnaryExpression(element)) {
          const numericValue = parseNumber(element.getText());
          return numericValue === undefined ? acc : [...acc, numericValue];
        }
        return acc;
      }, []);

    return values.length > 0 ? values : undefined;
  }

  return Node.isIdentifier(initializer)
    ? resolveEnumFromIdentifier(initializer)
    : undefined;
};

/**
 * Extract all supported options from @ApiProperty / @ApiPropertyOptional.
 */
const extractApiPropertyConstraints = (
  decorator: Decorator,
): Partial<ValidationConstraints> | undefined => {
  const objectLiteral = decorator
    .getCallExpression()
    ?.getArguments()[0]
    ?.asKind?.(ts.SyntaxKind.ObjectLiteralExpression);

  if (!objectLiteral) return undefined;

  const enumValues = extractApiPropertyEnum(objectLiteral);

  const result: Partial<ValidationConstraints> = {
    ...(enumValues ? { enum: enumValues } : {}),
    ...buildConstraintsFromKeys(objectLiteral, API_STRING_KEYS, (obj, key) =>
      getStringProp(obj, key),
    ),
    ...buildConstraintsFromKeys(objectLiteral, API_NUMBER_KEYS, (obj, key) =>
      getNumericProp(obj, key),
    ),
    ...buildConstraintsFromKeys(objectLiteral, API_BOOLEAN_KEYS, (obj, key) =>
      getBooleanProp(obj, key),
    ),
    ...buildConstraintsFromKeys(objectLiteral, API_PRIMITIVE_KEYS, (obj, key) =>
      getPrimitiveValue(obj, key),
    ),
  };

  return Object.keys(result).length > 0 ? result : undefined;
};

const compactConstraints = (
  constraints: Partial<ValidationConstraints>,
): Partial<ValidationConstraints> =>
  Object.fromEntries(
    Object.entries(constraints).filter(([, value]) => value !== undefined),
  ) as Partial<ValidationConstraints>;

const mergeConstraints = (
  existing: ValidationConstraints,
  incoming: Partial<ValidationConstraints>,
): ValidationConstraints => ({
  ...existing,
  ...compactConstraints(incoming),
});

const mergeApiPropertyConstraints = (
  existing: ValidationConstraints,
  apiConstraints: Partial<ValidationConstraints>,
): ValidationConstraints => ({
  ...compactConstraints(apiConstraints),
  ...existing,
});

const withMergedConstraints = (
  state: PropertyValidationInfo,
  incoming: Partial<ValidationConstraints>,
): PropertyValidationInfo => ({
  ...state,
  constraints: mergeConstraints(state.constraints, incoming),
});

const withApiPropertyConstraints = (
  state: PropertyValidationInfo,
  apiConstraints: Partial<ValidationConstraints>,
): PropertyValidationInfo => ({
  ...state,
  constraints: mergeApiPropertyConstraints(state.constraints, apiConstraints),
});

const createMappedDecoratorHandler =
  (mapper: DecoratorMapper): DecoratorHandler =>
  (state, decorator) =>
    withMergedConstraints(state, mapper(getDecoratorArgs(decorator)));

const mappedDecoratorHandlers = Object.fromEntries(
  Object.entries(DECORATOR_MAPPINGS).map(([decoratorName, mapper]) => [
    decoratorName,
    createMappedDecoratorHandler(mapper),
  ]),
) as Record<string, DecoratorHandler>;

const apiPropertyDecoratorHandler: DecoratorHandler = (state, decorator) =>
  Option.fromNullable(extractApiPropertyConstraints(decorator)).pipe(
    Option.match({
      onNone: () => state,
      onSome: (apiConstraints) =>
        withApiPropertyConstraints(state, apiConstraints),
    }),
  );

const decoratorHandlers: Record<string, DecoratorHandler> = {
  ...mappedDecoratorHandlers,
  IsOptional: (state) => ({ ...state, isOptional: true }),
  ApiHideProperty: (state) => withMergedConstraints(state, { hidden: true }),
  IsEnum: (state, decorator) =>
    Option.fromNullable(resolveEnumFromDecorator(decorator)).pipe(
      Option.filter((enumValues) => enumValues.length > 0),
      Option.match({
        onNone: () => state,
        onSome: (enumValues) =>
          withMergedConstraints(state, { enum: enumValues }),
      }),
    ),
  ApiProperty: apiPropertyDecoratorHandler,
  ApiPropertyOptional: apiPropertyDecoratorHandler,
};

const INITIAL_PROPERTY_VALIDATION_INFO: PropertyValidationInfo = {
  isOptional: false,
  constraints: {},
};

const applyDecorator = (
  state: PropertyValidationInfo,
  decorator: Decorator,
): PropertyValidationInfo =>
  getDecoratorName(decorator).pipe(
    Option.flatMap((name) => Option.fromNullable(decoratorHandlers[name])),
    Option.match({
      onNone: () => state,
      onSome: (handler) => handler(state, decorator),
    }),
  );

const extractPropertyState = (
  property: PropertyDeclaration,
): PropertyValidationInfo =>
  property
    .getDecorators()
    .reduce<PropertyValidationInfo>(
      applyDecorator,
      INITIAL_PROPERTY_VALIDATION_INFO,
    );

const hasConstraints = (constraints: ValidationConstraints): boolean =>
  Object.keys(constraints).length > 0;

/**
 * Extract validation constraints from a property's decorators
 */
export const extractPropertyConstraints = (
  property: PropertyDeclaration,
): ValidationConstraints => extractPropertyState(property).constraints;

/**
 * Check if a property has @IsOptional() decorator
 */
export const isPropertyOptional = (property: PropertyDeclaration): boolean =>
  extractPropertyState(property).isOptional;

/**
 * Extract both optionality and constraints from a property in a single pass.
 * This is more efficient than calling isPropertyOptional and extractPropertyConstraints separately.
 */
export const extractPropertyValidationInfo = (
  property: PropertyDeclaration,
): PropertyValidationInfo => extractPropertyState(property);

/**
 * Extract class-level validation metadata in one pass.
 */
export const extractClassValidationInfo = (
  classDecl: ClassDeclaration,
): ClassValidationInfo =>
  classDecl.getProperties().reduce<ClassValidationInfo>(
    (acc, property) => {
      const propertyName = property.getName();
      const propertyValidation = extractPropertyValidationInfo(property);

      return {
        constraints: hasConstraints(propertyValidation.constraints)
          ? {
              ...acc.constraints,
              [propertyName]: propertyValidation.constraints,
            }
          : acc.constraints,
        required: propertyValidation.isOptional
          ? acc.required
          : [...acc.required, propertyName],
      };
    },
    { constraints: {}, required: [] },
  );

/**
 * Extract all property constraints from a class
 */
export const extractClassConstraints = (
  classDecl: ClassDeclaration,
): Record<string, ValidationConstraints> =>
  extractClassValidationInfo(classDecl).constraints;

/**
 * Get required property names from a class (those without @IsOptional)
 */
export const getRequiredProperties = (
  classDecl: ClassDeclaration,
): readonly string[] => extractClassValidationInfo(classDecl).required;

const collectHiddenProperties = (
  propertyConstraints: Record<string, ValidationConstraints>,
): ReadonlySet<string> =>
  new Set(
    Object.entries(propertyConstraints).flatMap(
      ([propertyName, constraints]) =>
        constraints.hidden ? [propertyName] : [],
    ),
  );

const applyPropertyConstraintsToSchema = (
  propertySchema: JsonSchema,
  constraints: ValidationConstraints | undefined,
): JsonSchema =>
  Option.fromNullable(constraints).pipe(
    Option.map((propertyConstraints) => {
      const { hidden: _hidden, ...cleanConstraints } = propertyConstraints;

      if (propertySchema.type === 'array' && cleanConstraints.enum) {
        const { enum: enumValues, ...restConstraints } = cleanConstraints;
        return {
          ...propertySchema,
          ...restConstraints,
          items: { ...propertySchema.items, enum: enumValues },
        } as JsonSchema;
      }

      return {
        ...propertySchema,
        ...cleanConstraints,
      } as JsonSchema;
    }),
    Option.getOrElse(() => propertySchema),
  );

const buildUpdatedProperties = (
  schema: JsonSchema,
  propertyConstraints: Record<string, ValidationConstraints>,
  hiddenProperties: ReadonlySet<string>,
): Record<string, JsonSchema> | undefined => {
  const shouldUpdateProperties =
    Object.keys(propertyConstraints).length > 0 || hiddenProperties.size > 0;

  return Option.fromNullable(schema.properties).pipe(
    Option.filter(() => shouldUpdateProperties),
    Option.map(
      (properties) =>
        Object.fromEntries(
          Object.entries(properties)
            .filter(([propertyName]) => !hiddenProperties.has(propertyName))
            .map(([propertyName, propertySchema]) => [
              propertyName,
              applyPropertyConstraintsToSchema(
                propertySchema,
                propertyConstraints[propertyName],
              ),
            ]),
        ) as Record<string, JsonSchema>,
    ),
    Option.getOrUndefined,
  );
};

const buildUpdatedRequired = (
  schema: JsonSchema,
  requiredProperties: readonly string[] | undefined,
  hiddenProperties: ReadonlySet<string>,
): readonly string[] | undefined =>
  Option.fromNullable(requiredProperties).pipe(
    Option.filter((properties) => properties.length > 0),
    Option.map((properties) =>
      [...new Set([...(schema.required ?? []), ...properties])].filter(
        (propertyName) => !hiddenProperties.has(propertyName),
      ),
    ),
    Option.getOrElse(() =>
      hiddenProperties.size > 0 && schema.required
        ? schema.required.filter(
            (propertyName) => !hiddenProperties.has(propertyName),
          )
        : undefined,
    ),
  );

/**
 * Apply validation constraints to a JSON Schema
 */
export const applyConstraintsToSchema = (
  schema: JsonSchema,
  propertyConstraints: Record<string, ValidationConstraints>,
  requiredProperties?: readonly string[],
): JsonSchema => {
  const hiddenProperties = collectHiddenProperties(propertyConstraints);
  const updatedProperties = buildUpdatedProperties(
    schema,
    propertyConstraints,
    hiddenProperties,
  );
  const updatedRequired = buildUpdatedRequired(
    schema,
    requiredProperties,
    hiddenProperties,
  );

  return {
    ...schema,
    ...(updatedProperties === undefined
      ? {}
      : { properties: updatedProperties }),
    ...(updatedRequired === undefined ? {} : { required: updatedRequired }),
  } as JsonSchema;
};

/**
 * Merge validation constraints into generated schemas
 */
export const mergeValidationConstraints = (
  schemas: GeneratedSchemas,
  classConstraints: Map<string, Record<string, ValidationConstraints>>,
  classRequired: Map<string, readonly string[]>,
): GeneratedSchemas => {
  const definitions = Object.fromEntries(
    Object.entries(schemas.definitions).map(([name, schema]) => {
      const constraints = classConstraints.get(name);
      const required = classRequired.get(name);

      return [
        name,
        constraints || required
          ? applyConstraintsToSchema(schema, constraints ?? {}, required)
          : schema,
      ];
    }),
  ) as Record<string, JsonSchema>;

  return { definitions };
};

/**
 * Effect-native wrapper with trace annotations for class validation extraction.
 */
export const extractClassValidationInfoEffect = Effect.fn(
  'ValidationMapper.extractClassValidationInfo',
)(function* (classDecl: ClassDeclaration) {
  const className = classDecl.getName() ?? '<anonymous>';
  const filePath = classDecl.getSourceFile().getFilePath();
  const info = yield* Effect.try({
    try: () => extractClassValidationInfo(classDecl),
    catch: (cause) => ValidationMappingError.create(className, filePath, cause),
  });

  yield* Effect.annotateCurrentSpan('className', className);
  yield* Effect.annotateCurrentSpan('filePath', filePath);
  yield* Effect.annotateCurrentSpan(
    'constraintPropertyCount',
    Object.keys(info.constraints).length,
  );
  yield* Effect.annotateCurrentSpan(
    'requiredPropertyCount',
    info.required.length,
  );

  return info;
});

/**
 * Effect-native wrapper with trace annotations for schema merge.
 */
export const mergeValidationConstraintsEffect = Effect.fn(
  'ValidationMapper.mergeValidationConstraints',
)(function* (
  schemas: GeneratedSchemas,
  classConstraints: Map<string, Record<string, ValidationConstraints>>,
  classRequired: Map<string, readonly string[]>,
) {
  const merged = mergeValidationConstraints(
    schemas,
    classConstraints,
    classRequired,
  );

  yield* Effect.annotateCurrentSpan(
    'inputDefinitionCount',
    Object.keys(schemas.definitions).length,
  );
  yield* Effect.annotateCurrentSpan(
    'outputDefinitionCount',
    Object.keys(merged.definitions).length,
  );
  yield* Effect.annotateCurrentSpan(
    'classConstraintCount',
    classConstraints.size,
  );
  yield* Effect.annotateCurrentSpan('classRequiredCount', classRequired.size);

  return merged;
});
