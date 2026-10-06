/**
 * Validation Mapper - Maps class-validator decorators to OpenAPI constraints
 *
 * This module extracts validation information from class-validator decorators
 * in TypeScript source files and applies them to JSON Schema definitions.
 */

import { Effect, Option } from 'effect';
import type {
  ClassDeclaration,
  EnumDeclaration,
  EnumMember,
  PropertyDeclaration,
} from 'ts-morph';
import { Node, ts } from 'ts-morph';
import type { GeneratedSchemas, JsonSchema } from './schema-generator.js';
import { ValidationMappingError } from './errors.js';
import {
  getEffectiveDecorators,
  type DecoratorCall,
  type DecoratorExpansionOptions,
} from './decorators.js';
import {
  asBoolean,
  asNumber,
  asString,
  getProperty,
  toPlain,
  unwrapThunk,
  type StaticValue,
} from './static-value.js';
import {
  DEFAULT_SCHEMA_NAMING,
  allowsNull,
  isArraySchema,
  readDeclaredPropertySchema,
  type EnumValue,
  type SchemaNaming,
} from './property-schema.js';
import { getLiteralValues, resolveDeclarations } from './ast.js';

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

  readonly schemaOverride?: JsonSchema;
  readonly keywords?: Readonly<Record<string, unknown>>;
  readonly enumComponent?: {
    readonly name: string;
    readonly schema: JsonSchema;
  };
}

/**
 * Result of extracting property validation info in a single pass
 */
export interface PropertyValidationInfo {
  readonly isOptional: boolean;
  readonly constraints: ValidationConstraints;
  readonly unreadable?: readonly string[];
}

/**
 * Result of extracting validation metadata from an entire class.
 * Collected in a single pass over properties.
 */
export interface ClassValidationInfo {
  readonly constraints: Record<string, ValidationConstraints>;
  readonly required: readonly string[];
  readonly optional: readonly string[];
  readonly unreadable?: readonly string[];
}

type DecoratorMapper = (
  args: readonly string[],
) => Partial<ValidationConstraints>;
type HandlerContext = {
  readonly naming: SchemaNaming;
  readonly property: PropertyDeclaration;
};

type DecoratorHandler = (
  state: PropertyValidationInfo,
  call: DecoratorCall,
  context: HandlerContext,
) => PropertyValidationInfo;

type EnumExtractionState = {
  readonly values: readonly EnumValue[];
  readonly nextValue: number;
};

type EnumInitializer = NonNullable<ReturnType<EnumMember['getInitializer']>>;

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

const argumentText = (value: StaticValue | undefined) => {
  switch (value?.kind) {
    case 'literal':
      return value.value === undefined ? '' : String(value.value);
    case 'reference':
      return value.name;
    case 'unknown':
      return value.text;
    default:
      return '';
  }
};

const getDecoratorArgs = (call: DecoratorCall) => call.args.map(argumentText);

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

const appendEnumValue = (
  state: EnumExtractionState,
  value: EnumValue,
  nextValue: number,
): EnumExtractionState => ({
  values: [...state.values, value],
  nextValue,
});

const resolveEnumInitializerValue = (
  initializer: EnumInitializer,
  nextValue: number,
): { readonly value: EnumValue; readonly nextValue: number } => {
  const stringLiteral = initializer.asKind?.(ts.SyntaxKind.StringLiteral);
  if (stringLiteral) {
    return { value: stringLiteral.getLiteralValue(), nextValue };
  }

  const numericLiteral = initializer.asKind?.(ts.SyntaxKind.NumericLiteral);
  if (numericLiteral) {
    const value = numericLiteral.getLiteralValue();
    return { value, nextValue: value + 1 };
  }

  return resolveEnumMemberValue(initializer.getText(), nextValue);
};

const resolveEnumMember = (
  state: EnumExtractionState,
  member: EnumMember,
): EnumExtractionState =>
  Option.fromNullable(member.getInitializer()).pipe(
    Option.match({
      onNone: () =>
        appendEnumValue(state, state.nextValue, state.nextValue + 1),
      onSome: (initializer) => {
        const resolved = resolveEnumInitializerValue(
          initializer,
          state.nextValue,
        );
        return appendEnumValue(state, resolved.value, resolved.nextValue);
      },
    }),
  );

const extractEnumValues = (enumDecl: EnumDeclaration): readonly EnumValue[] =>
  enumDecl.getMembers().reduce<EnumExtractionState>(resolveEnumMember, {
    values: [],
    nextValue: 0,
  }).values;

const resolveEnumFromValue = (value: StaticValue | undefined) => {
  const unwrapped = unwrapThunk(value);
  if (unwrapped?.kind !== 'reference' || !unwrapped.node) return undefined;
  const enumDecl = resolveDeclarations(unwrapped.node).find(
    Node.isEnumDeclaration,
  );
  return enumDecl && extractEnumValues(enumDecl);
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
const API_PLAIN_KEYS = ['example', 'default'] as const;
const buildConstraintsFromKeys = <K extends keyof ValidationConstraints>(
  options: StaticValue,
  keys: readonly K[],
  read: (
    value: StaticValue | undefined,
  ) => ValidationConstraints[K] | undefined,
): Partial<ValidationConstraints> =>
  Object.fromEntries(
    keys.flatMap((key) => {
      const value = read(getProperty(options, key));
      return value === undefined ? [] : ([[key, value]] as const);
    }),
  ) as Partial<ValidationConstraints>;

export const readEnumValues = (
  value: StaticValue | undefined,
): readonly EnumValue[] | undefined => {
  const unwrapped = unwrapThunk(value);
  if (unwrapped?.kind !== 'array' && unwrapped?.kind !== 'object') {
    return resolveEnumFromValue(unwrapped);
  }
  const items =
    unwrapped.kind === 'array'
      ? unwrapped.items
      : Object.values(unwrapped.properties);
  const values = items.flatMap((item) =>
    item.kind === 'literal' &&
    (typeof item.value === 'string' || typeof item.value === 'number')
      ? [item.value]
      : [],
  );
  return values.length > 0 ? values : undefined;
};

/**
 * Extract all supported options from @ApiProperty / @ApiPropertyOptional.
 */
const extractApiPropertyConstraints = (
  call: DecoratorCall,
  { naming, property }: HandlerContext,
): Partial<ValidationConstraints> | undefined => {
  const options = call.args[0];
  if (options?.kind !== 'object') return undefined;

  const declared = readDeclaredPropertySchema(
    options,
    naming,
    readEnumValues,
    () => getLiteralValues(property.getType()),
  );
  const result = {
    ...buildConstraintsFromKeys(options, API_STRING_KEYS, asString),
    ...buildConstraintsFromKeys(options, API_NUMBER_KEYS, asNumber),
    ...buildConstraintsFromKeys(options, API_BOOLEAN_KEYS, asBoolean),
    ...buildConstraintsFromKeys(options, API_PLAIN_KEYS, (value) =>
      value === undefined ? undefined : toPlain(value),
    ),
    ...(declared.override ? { schemaOverride: declared.override } : {}),
    ...(Object.keys(declared.keywords).length > 0
      ? { keywords: declared.keywords }
      : {}),
    ...(declared.enumComponent
      ? { enumComponent: declared.enumComponent }
      : {}),
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
  (state, call) =>
    withMergedConstraints(state, mapper(getDecoratorArgs(call)));

const mappedDecoratorHandlers = Object.fromEntries(
  Object.entries(DECORATOR_MAPPINGS).map(([decoratorName, mapper]) => [
    decoratorName,
    createMappedDecoratorHandler(mapper),
  ]),
) as Record<string, DecoratorHandler>;

const withApiPropertyRequired = (
  state: PropertyValidationInfo,
  call: DecoratorCall,
): PropertyValidationInfo => {
  const required = asBoolean(getProperty(call.args[0], 'required'));
  return required === undefined ? state : { ...state, isOptional: !required };
};

const describeLocation = (
  value: StaticValue | undefined,
  call: DecoratorCall,
) => {
  const node = (value && 'node' in value ? value.node : undefined) ?? call.node;
  return `${node.getSourceFile().getFilePath()}:${node.getStartLineNumber()}`;
};

const describeArgument = (value: StaticValue | undefined) => {
  if (value === undefined) return 'undefined';
  if (value.kind === 'unknown') return value.text;
  if (value.kind === 'reference') return value.name;
  return JSON.stringify(toPlain(value));
};

// Recorded so an argument is never silently dropped
const withUnreadable = (
  state: PropertyValidationInfo,
  message: string,
): PropertyValidationInfo => ({
  ...state,
  unreadable: [...(state.unreadable ?? []), message],
});

const withEnumArgument = (
  state: PropertyValidationInfo,
  call: DecoratorCall,
  value: StaticValue | undefined,
) => {
  const enumValues = readEnumValues(value);
  if (enumValues && enumValues.length > 0) {
    return withMergedConstraints(state, { enum: enumValues });
  }
  return withUnreadable(
    state,
    `@${call.name}(values) cannot read \`${describeArgument(value)}\` statically (${describeLocation(value, call)})`,
  );
};

const apiPropertyDecoratorHandler: DecoratorHandler = (
  state,
  call,
  context,
) => {
  const enumOption = getProperty(call.args[0], 'enum');
  if (enumOption === undefined || readEnumValues(enumOption)) {
    return apiPropertyConstraintsHandler(state, call, context);
  }
  const unreadable = withUnreadable(
    state,
    `@${call.name}({ enum }) cannot read \`${describeArgument(enumOption)}\` statically (${describeLocation(enumOption, call)})`,
  );
  return apiPropertyConstraintsHandler(unreadable, call, context);
};

const apiPropertyConstraintsHandler: DecoratorHandler = (
  state,
  call,
  context,
) =>
  Option.fromNullable(extractApiPropertyConstraints(call, context)).pipe(
    Option.match({
      onNone: () => state,
      onSome: (apiConstraints) =>
        withApiPropertyConstraints(state, apiConstraints),
    }),
    (updated) => withApiPropertyRequired(updated, call),
  );

const decoratorHandlers: Record<string, DecoratorHandler> = {
  ...mappedDecoratorHandlers,
  IsOptional: (state) => ({ ...state, isOptional: true }),
  ApiHideProperty: (state) => withMergedConstraints(state, { hidden: true }),
  IsEnum: (state, call) => withEnumArgument(state, call, call.args[0]),
  IsIn: (state, call) => withEnumArgument(state, call, call.args[0]),
  ApiProperty: apiPropertyDecoratorHandler,
  ApiPropertyOptional: (state, call, context) =>
    apiPropertyDecoratorHandler({ ...state, isOptional: true }, call, context),
};

const createInitialPropertyValidationInfo = (
  property: PropertyDeclaration,
): PropertyValidationInfo => ({
  isOptional: property.hasQuestionToken(),
  constraints: {},
});

const extractPropertyState = (
  property: PropertyDeclaration,
  expansion?: DecoratorExpansionOptions,
  naming: SchemaNaming = DEFAULT_SCHEMA_NAMING,
): PropertyValidationInfo =>
  getEffectiveDecorators(property, expansion).reduce<PropertyValidationInfo>(
    (state, call) => {
      const handler = decoratorHandlers[call.name];
      return handler ? handler(state, call, { naming, property }) : state;
    },
    createInitialPropertyValidationInfo(property),
  );

const hasConstraints = (constraints: ValidationConstraints): boolean =>
  Object.keys(constraints).length > 0;

/**
 * Extract validation constraints from a property's decorators
 */
export const extractPropertyConstraints = (
  property: PropertyDeclaration,
  expansion?: DecoratorExpansionOptions,
  naming?: SchemaNaming,
): ValidationConstraints =>
  extractPropertyState(property, expansion, naming).constraints;

/**
 * Check if a property is optional.
 */
export const isPropertyOptional = (
  property: PropertyDeclaration,
  expansion?: DecoratorExpansionOptions,
): boolean => extractPropertyState(property, expansion).isOptional;

/**
 * Extract both optionality and constraints from a property in a single pass.
 * This is more efficient than calling isPropertyOptional and extractPropertyConstraints separately.
 */
export const extractPropertyValidationInfo = (
  property: PropertyDeclaration,
  expansion?: DecoratorExpansionOptions,
  naming?: SchemaNaming,
): PropertyValidationInfo => extractPropertyState(property, expansion, naming);

/**
 * Extract class-level validation metadata in one pass.
 */
export const extractClassValidationInfo = (
  classDecl: ClassDeclaration,
  expansion?: DecoratorExpansionOptions,
  naming?: SchemaNaming,
): ClassValidationInfo =>
  classDecl.getProperties().reduce<ClassValidationInfo>(
    (acc, property) => {
      const propertyName = property.getName();
      const propertyValidation = extractPropertyValidationInfo(
        property,
        expansion,
        naming,
      );

      const unreadable = (propertyValidation.unreadable ?? []).map(
        (note) =>
          `${classDecl.getName() ?? '<anonymous>'}.${propertyName}: ${note}`,
      );
      return {
        ...(acc.unreadable || unreadable.length > 0
          ? { unreadable: [...(acc.unreadable ?? []), ...unreadable] }
          : {}),
        constraints: hasConstraints(propertyValidation.constraints)
          ? {
              ...acc.constraints,
              [propertyName]: propertyValidation.constraints,
            }
          : acc.constraints,
        required: propertyValidation.isOptional
          ? acc.required
          : [...acc.required, propertyName],
        optional: propertyValidation.isOptional
          ? [...acc.optional, propertyName]
          : acc.optional,
      };
    },
    { constraints: {}, required: [], optional: [] },
  );

/**
 * Extract all property constraints from a class
 */
export const extractClassConstraints = (
  classDecl: ClassDeclaration,
  expansion?: DecoratorExpansionOptions,
): Record<string, ValidationConstraints> =>
  extractClassValidationInfo(classDecl, expansion).constraints;

/**
 * Get required property names from a class (those without @IsOptional)
 */
export const getRequiredProperties = (
  classDecl: ClassDeclaration,
  expansion?: DecoratorExpansionOptions,
): readonly string[] =>
  extractClassValidationInfo(classDecl, expansion).required;

const collectHiddenProperties = (
  propertyConstraints: Record<string, ValidationConstraints>,
): ReadonlySet<string> =>
  new Set(
    Object.entries(propertyConstraints).flatMap(
      ([propertyName, constraints]) =>
        constraints.hidden ? [propertyName] : [],
    ),
  );

type CleanPropertyConstraints = Omit<
  ValidationConstraints,
  'hidden' | 'isArray'
>;

const cleanPropertyConstraints = (
  constraints: ValidationConstraints,
): CleanPropertyConstraints => {
  const {
    hidden: _hidden,
    isArray: _isArray,
    schemaOverride: _schemaOverride,
    keywords: _keywords,
    enumComponent: _enumComponent,
    ...cleanConstraints
  } = constraints;
  return cleanConstraints;
};

// The declared type replaces the inferred one, as in @nestjs/swagger, but
// an array property stays an array of it unless it is an array itself, and
// `T | null` stays nullable
const applySchemaOverride = (
  propertySchema: JsonSchema,
  constraints: ValidationConstraints,
): JsonSchema => {
  const override = constraints.schemaOverride!;
  const keepsArray =
    isArraySchema(propertySchema) &&
    constraints.isArray !== false &&
    override.type !== 'array';
  const typed: JsonSchema = keepsArray
    ? { type: 'array', items: override }
    : override;
  const {
    type: _type,
    enum: _enum,
    ...rest
  } = cleanPropertyConstraints(constraints);

  return {
    ...typed,
    ...(allowsNull(propertySchema) ? { nullable: true } : {}),
    ...(propertySchema.description && !rest.description
      ? { description: propertySchema.description }
      : {}),
    ...rest,
    ...(constraints.keywords ?? {}),
  } as JsonSchema;
};

const hasNullableArraySchema = (schema: JsonSchema): boolean =>
  schema.anyOf?.some((member) => member.type === 'array') === true;

const isItemTypeOverride = (typeOverride: string | undefined): boolean =>
  typeof typeOverride === 'string' && typeOverride !== 'array';

const shouldApplyNullableArrayItemConstraints = (
  propertySchema: JsonSchema,
  isArray: boolean | undefined,
  typeOverride: string | undefined,
  enumValues: readonly unknown[] | undefined,
): boolean =>
  hasNullableArraySchema(propertySchema) &&
  ((isArray === true && isItemTypeOverride(typeOverride)) ||
    enumValues !== undefined);

const applyNullableArrayItemConstraints = (
  propertySchema: JsonSchema,
  isArray: boolean | undefined,
  typeOverride: string | undefined,
  enumValues: readonly unknown[] | undefined,
  restConstraints: Omit<CleanPropertyConstraints, 'type' | 'enum'>,
): JsonSchema => {
  const hasItemTypeOverride =
    isArray === true && isItemTypeOverride(typeOverride);
  const itemConstraints = {
    ...(hasItemTypeOverride ? { type: typeOverride } : {}),
    ...(enumValues ? { enum: enumValues } : {}),
  };

  return {
    ...propertySchema,
    ...restConstraints,
    anyOf: propertySchema.anyOf?.map((member) =>
      member.type === 'array'
        ? ({
            ...member,
            items: {
              ...(hasItemTypeOverride ? {} : member.items),
              ...itemConstraints,
            },
          } as JsonSchema)
        : member,
    ),
  } as JsonSchema;
};

const shouldApplyArrayItemConstraints = (
  propertySchema: JsonSchema,
  typeOverride: string | undefined,
  enumValues: readonly unknown[] | undefined,
): boolean =>
  propertySchema.type === 'array' &&
  (isItemTypeOverride(typeOverride) || enumValues !== undefined);

const applyArrayItemConstraints = (
  propertySchema: JsonSchema,
  typeOverride: string | undefined,
  enumValues: readonly unknown[] | undefined,
  restConstraints: Omit<CleanPropertyConstraints, 'type' | 'enum'>,
): JsonSchema => {
  const hasItemTypeOverride = isItemTypeOverride(typeOverride);

  return {
    ...propertySchema,
    ...restConstraints,
    items: {
      ...(hasItemTypeOverride ? {} : propertySchema.items),
      ...(hasItemTypeOverride ? { type: typeOverride } : {}),
      ...(enumValues ? { enum: enumValues } : {}),
    },
  } as JsonSchema;
};

const applyDirectPropertyConstraints = (
  propertySchema: JsonSchema,
  typeOverride: string | undefined,
  enumValues: readonly unknown[] | undefined,
  restConstraints: Omit<CleanPropertyConstraints, 'type' | 'enum'>,
): JsonSchema =>
  ({
    ...propertySchema,
    ...(typeOverride === undefined ? {} : { type: typeOverride }),
    ...restConstraints,
    ...(enumValues === undefined ? {} : { enum: enumValues }),
  }) as JsonSchema;

export const applyPropertyConstraints = (
  propertySchema: JsonSchema,
  constraints: ValidationConstraints | undefined,
): JsonSchema =>
  Option.fromNullable(constraints).pipe(
    Option.map((propertyConstraints) => {
      if (propertyConstraints.schemaOverride) {
        return applySchemaOverride(propertySchema, propertyConstraints);
      }

      const isArray = propertyConstraints.isArray;
      const {
        type: typeOverride,
        enum: enumValues,
        ...restConstraints
      } = cleanPropertyConstraints(propertyConstraints);
      const keywords = propertyConstraints.keywords;
      if (keywords) Object.assign(restConstraints, keywords);

      if (
        shouldApplyNullableArrayItemConstraints(
          propertySchema,
          isArray,
          typeOverride,
          enumValues,
        )
      ) {
        return applyNullableArrayItemConstraints(
          propertySchema,
          isArray,
          typeOverride,
          enumValues,
          restConstraints,
        );
      }

      return shouldApplyArrayItemConstraints(
        propertySchema,
        typeOverride,
        enumValues,
      )
        ? applyArrayItemConstraints(
            propertySchema,
            typeOverride,
            enumValues,
            restConstraints,
          )
        : applyDirectPropertyConstraints(
            propertySchema,
            typeOverride,
            enumValues,
            restConstraints,
          );
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
              applyPropertyConstraints(
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
  optionalProperties: readonly string[] = [],
): readonly string[] | undefined => {
  const hasRequired = (requiredProperties?.length ?? 0) > 0;
  if (
    !hasRequired &&
    hiddenProperties.size === 0 &&
    optionalProperties.length === 0
  ) {
    return undefined;
  }

  // Decorators can make a property optional even when the TypeScript
  // declaration has no `?`
  const excluded = new Set([...hiddenProperties, ...optionalProperties]);
  return [
    ...new Set([...(schema.required ?? []), ...(requiredProperties ?? [])]),
  ].filter((propertyName) => !excluded.has(propertyName));
};

/**
 * Apply validation constraints to a JSON Schema
 */
export const applyConstraintsToSchema = (
  schema: JsonSchema,
  propertyConstraints: Record<string, ValidationConstraints>,
  requiredProperties?: readonly string[],
  optionalProperties?: readonly string[],
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
    optionalProperties,
  );

  if (updatedRequired !== undefined && updatedRequired.length === 0) {
    const { required: _required, ...withoutRequired } = schema;
    return {
      ...withoutRequired,
      ...(updatedProperties === undefined
        ? {}
        : { properties: updatedProperties }),
    } as JsonSchema;
  }

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
  classOptional: Map<string, readonly string[]> = new Map(),
): GeneratedSchemas => {
  const enumComponents = Object.fromEntries(
    [...classConstraints.values()].flatMap((properties) =>
      Object.values(properties).flatMap((constraints) =>
        constraints.enumComponent
          ? [[constraints.enumComponent.name, constraints.enumComponent.schema]]
          : [],
      ),
    ),
  ) as Record<string, JsonSchema>;

  const definitions = Object.fromEntries(
    Object.entries({ ...enumComponents, ...schemas.definitions }).map(
      ([name, schema]) => {
        const constraints = classConstraints.get(name);
        const required = classRequired.get(name);
        const optional = classOptional.get(name);

        return [
          name,
          constraints || required || optional
            ? applyConstraintsToSchema(
                schema,
                constraints ?? {},
                required,
                optional,
              )
            : schema,
        ];
      },
    ),
  ) as Record<string, JsonSchema>;

  return { definitions };
};

const serviceExtractClassValidationInfo = Effect.fn(
  'ValidationMapperService.extractClassValidationInfo',
)(function* (
  classDecl: ClassDeclaration,
  expansion?: DecoratorExpansionOptions,
  naming?: SchemaNaming,
) {
  const className = classDecl.getName() ?? '<anonymous>';
  const filePath = classDecl.getSourceFile().getFilePath();
  const info = yield* Effect.try({
    try: () => extractClassValidationInfo(classDecl, expansion, naming),
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

const serviceMergeValidationConstraints = Effect.fn(
  'ValidationMapperService.mergeValidationConstraints',
)(function* (
  schemas: GeneratedSchemas,
  classConstraints: Map<string, Record<string, ValidationConstraints>>,
  classRequired: Map<string, readonly string[]>,
  classOptional?: Map<string, readonly string[]>,
) {
  const merged = mergeValidationConstraints(
    schemas,
    classConstraints,
    classRequired,
    classOptional,
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

export class ValidationMapperService extends Effect.Service<ValidationMapperService>()(
  'ValidationMapperService',
  {
    effect: Effect.succeed({
      extractClassValidationInfo: serviceExtractClassValidationInfo,
      mergeValidationConstraints: serviceMergeValidationConstraints,
    }),
  },
) {}

/**
 * Effect-native wrapper with trace annotations for class validation extraction.
 */
export const extractClassValidationInfoEffect =
  serviceExtractClassValidationInfo;

/**
 * Effect-native wrapper with trace annotations for schema merge.
 */
export const mergeValidationConstraintsEffect =
  serviceMergeValidationConstraints;
