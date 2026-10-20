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
  Type,
} from 'ts-morph';
import { Node, ts } from 'ts-morph';
import type {
  GeneratedSchemas,
  JsonSchema,
} from '../schema/schema-generator.js';
import { ValidationMappingError } from '../config/errors.js';
import {
  getEffectiveDecorators,
  type DecoratorCall,
  type DecoratorExpansionOptions,
} from './decorators.js';
import {
  asBoolean,
  asNumber,
  asString,
  findUnresolvedKeys,
  getProperty,
  toPlain,
  unwrapThunk,
  type StaticValue,
} from './static-value.js';
import {
  DEFAULT_SCHEMA_NAMING,
  readDeclaredPropertySchema,
  type EnumValue,
  type SchemaNaming,
} from './property-schema.js';
import { getLiteralValues, resolveDeclarations } from './ast.js';
import { isNullable } from '../schema/nullable.js';

export interface ValidationConstraints {
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly format?: string;

  readonly minimum?: number;
  readonly maximum?: number;
  readonly exclusiveMinimum?: number | boolean;
  readonly exclusiveMaximum?: number | boolean;
  readonly multipleOf?: number;

  readonly minItems?: number;
  readonly maxItems?: number;
  readonly uniqueItems?: boolean;

  readonly enum?: readonly unknown[];

  readonly type?: string;

  readonly description?: string;
  readonly title?: string;
  readonly example?: unknown;
  readonly default?: unknown;
  readonly deprecated?: boolean;
  readonly readOnly?: boolean;
  readonly writeOnly?: boolean;
  readonly nullable?: boolean;
  readonly isArray?: boolean;

  readonly hidden?: boolean;

  readonly items?: ValidationConstraints;

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
  IsString: () => ({ type: 'string' }),
  IsNumber: () => ({ type: 'number' }),
  IsInt: () => ({ type: 'integer' }),
  IsBoolean: () => ({ type: 'boolean' }),
  IsArray: () => ({ type: 'array' }),
  IsObject: () => ({ type: 'object' }),
  IsDate: () => ({ type: 'string', format: 'date-time' }),

  IsEmail: () => ({ format: 'email' }),
  IsUrl: () => ({ format: 'uri' }),
  IsUUID: () => ({ format: 'uuid' }),
  IsDateString: () => ({ format: 'date-time' }),
  IsISO8601: () => ({ format: 'date-time' }),
  IsPhoneNumber: () => ({ format: 'phone' }),
  IsCreditCard: () => ({ format: 'credit-card' }),
  IsIP: () => ({ format: 'ipv4' }),
  IsJSON: () => ({ format: 'json' }),

  MinLength: (args) => ({ minLength: parseNumber(args[0]) }),
  MaxLength: (args) => ({ maxLength: parseNumber(args[0]) }),
  Length: (args) => ({
    minLength: parseNumber(args[0]),
    maxLength: parseNumber(args[1]) ?? parseNumber(args[0]),
  }),

  Matches: (args) => ({
    pattern:
      args[0] === undefined
        ? undefined
        : args[0].replace(/^\/(.*)\/[gimsuvy]*$/, '$1'),
  }),

  Min: (args) => ({ minimum: parseNumber(args[0]) }),
  Max: (args) => ({ maximum: parseNumber(args[0]) }),
  IsPositive: () => ({ exclusiveMinimum: 0 }),
  IsNegative: () => ({ exclusiveMaximum: 0 }),

  ArrayMinSize: (args) => ({ minItems: parseNumber(args[0]) }),
  ArrayMaxSize: (args) => ({ maxItems: parseNumber(args[0]) }),

  IsEnum: () => ({}),

  IsOptional: () => ({}),
  IsNotEmpty: () => ({ minLength: 1 }),
  IsDefined: () => ({}),
  IsEmpty: () => ({}),

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

const appliesToEach = (call: DecoratorCall) =>
  call.args.some((arg) => asBoolean(getProperty(arg, 'each')) === true);

const createMappedDecoratorHandler =
  (mapper: DecoratorMapper): DecoratorHandler =>
  (state, call) => {
    const constraints = mapper(getDecoratorArgs(call));
    if (!appliesToEach(call)) return withMergedConstraints(state, constraints);
    return withMergedConstraints(state, {
      items: mergeConstraints(state.constraints.items ?? {}, constraints),
    });
  };

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

const describeNode = (node: Node) =>
  `${node.getSourceFile().getFilePath()}:${node.getStartLineNumber()}`;

const describeLocation = (
  value: StaticValue | undefined,
  call: DecoratorCall,
) =>
  describeNode(
    (value && 'node' in value ? value.node : undefined) ?? call.node,
  );

const describeArgument = (value: StaticValue | undefined) => {
  if (value === undefined) return 'undefined';
  if (value.kind === 'unknown') return value.text;
  if (value.kind === 'reference') return value.name;
  return JSON.stringify(toPlain(value));
};

const TYPE_FALLBACK =
  '; the TypeScript type is used instead. Describe it with a literal, an enum, or a static expression';

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
    `@${call.name}(values) cannot read \`${describeArgument(value)}\` statically (${describeLocation(value, call)})${TYPE_FALLBACK}`,
  );
};

const withUnresolvedKeys = (
  state: PropertyValidationInfo,
  call: DecoratorCall,
) =>
  findUnresolvedKeys(call.args[0]).reduce(
    (acc, key) =>
      withUnreadable(
        acc,
        `@${call.name}() cannot read the key \`${key.getText()}\` statically (${describeNode(key)}); its entry is left out. Key it with a literal, an enum member, or a const`,
      ),
    state,
  );

const apiPropertyDecoratorHandler: DecoratorHandler = (
  state,
  call,
  context,
) => {
  const withKeys = withUnresolvedKeys(state, call);
  const enumOption = getProperty(call.args[0], 'enum');
  if (enumOption === undefined || readEnumValues(enumOption)) {
    return apiPropertyConstraintsHandler(withKeys, call, context);
  }
  const unreadable = withUnreadable(
    withKeys,
    `@${call.name}({ enum }) cannot read \`${describeArgument(enumOption)}\` statically (${describeLocation(enumOption, call)})${TYPE_FALLBACK}`,
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

const typeHasMember = (
  property: PropertyDeclaration,
  isMember: (member: Type) => boolean,
) => property.getType().getUnionTypes().some(isMember);

const isValidated = (decorators: readonly DecoratorCall[]) =>
  decorators.some((call) => call.name in DECORATOR_MAPPINGS);

const createInitialPropertyValidationInfo = (
  property: PropertyDeclaration,
  decorators: readonly DecoratorCall[],
): PropertyValidationInfo => ({
  isOptional:
    property.hasQuestionToken() ||
    (!isValidated(decorators) &&
      typeHasMember(property, (member) => member.isUndefined())),
  constraints: {},
});

const withNullSkippedByValidator = (
  state: PropertyValidationInfo,
  property: PropertyDeclaration,
  decorators: readonly DecoratorCall[],
): PropertyValidationInfo =>
  state.constraints.type !== undefined &&
  decorators.some((call) => call.name === 'IsOptional') &&
  typeHasMember(property, (member) => member.isNull())
    ? { ...state, constraints: { ...state.constraints, nullable: true } }
    : state;

const extractPropertyState = (
  property: PropertyDeclaration,
  expansion?: DecoratorExpansionOptions,
  naming: SchemaNaming = DEFAULT_SCHEMA_NAMING,
): PropertyValidationInfo => {
  const decorators = getEffectiveDecorators(property, expansion);
  const state = decorators.reduce<PropertyValidationInfo>(
    (current, call) => {
      const handler = decoratorHandlers[call.name];
      return handler ? handler(current, call, { naming, property }) : current;
    },
    createInitialPropertyValidationInfo(property, decorators),
  );
  return withNullSkippedByValidator(state, property, decorators);
};

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
  'hidden' | 'isArray' | 'items'
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
    items: _items,
    ...cleanConstraints
  } = constraints;
  return cleanConstraints;
};

const applySchemaOverride = (
  propertySchema: JsonSchema,
  constraints: ValidationConstraints,
): JsonSchema => {
  const typed = constraints.schemaOverride!;
  const {
    type: _type,
    enum: _enum,
    ...rest
  } = cleanPropertyConstraints(constraints);

  return {
    ...typed,
    ...(isNullable(propertySchema) ? { nullable: true } : {}),
    ...(propertySchema.description && !rest.description
      ? { description: propertySchema.description }
      : {}),
    ...rest,
    ...(constraints.keywords ?? {}),
  } as JsonSchema;
};

const isItemTypeOverride = (typeOverride: string | undefined): boolean =>
  typeof typeOverride === 'string' && typeOverride !== 'array';

const hasArrayShape = (schema: JsonSchema): boolean =>
  schema.type === 'array' ||
  schema.anyOf?.some((member) => member.type === 'array') === true;

/**
 * Rewrites the items of an array schema, or of each array member of an
 * `anyOf` (how `T[] | null` arrives). Any other schema is returned as it is.
 */
const withArrayItems = (
  schema: JsonSchema,
  toItems: (items: JsonSchema['items']) => JsonSchema['items'],
): JsonSchema => {
  if (schema.type === 'array')
    return { ...schema, items: toItems(schema.items) };
  if (!schema.anyOf?.some((member) => member.type === 'array')) return schema;
  return {
    ...schema,
    anyOf: schema.anyOf.map((member) =>
      member.type === 'array' ? withArrayItems(member, toItems) : member,
    ),
  };
};

/**
 * A declared item type or `enum` on an array property constrains its items.
 * The declared type replaces the inferred items; on `T[] | null` it counts
 * only with `isArray`.
 */
const applyArrayItemConstraints = (
  propertySchema: JsonSchema,
  isArray: boolean | undefined,
  typeOverride: string | undefined,
  enumValues: readonly unknown[] | undefined,
  restConstraints: Omit<CleanPropertyConstraints, 'type' | 'enum'>,
): JsonSchema | undefined => {
  const replacesItemType =
    isItemTypeOverride(typeOverride) &&
    (propertySchema.type === 'array' || isArray === true);
  if (
    !hasArrayShape(propertySchema) ||
    (!replacesItemType && enumValues === undefined)
  )
    return undefined;
  return withArrayItems(
    { ...propertySchema, ...restConstraints } as JsonSchema,
    (items) =>
      ({
        ...(replacesItemType ? { type: typeOverride } : items),
        ...(enumValues ? { enum: enumValues } : {}),
      }) as JsonSchema,
  );
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

const STRING_KEYWORDS = ['minLength', 'maxLength', 'pattern'] as const;
const STRING_FORMATS = new Set(
  Object.values(DECORATOR_MAPPINGS).flatMap((mapper) => {
    const { type, format } = mapper([]);
    return type === undefined && format ? [format] : [];
  }),
);

const schemaTypes = (schema: JsonSchema): readonly string[] | undefined => {
  if (typeof schema.type === 'string') return [schema.type];
  if (Array.isArray(schema.type)) return schema.type as string[];
  const members = schema.anyOf ?? schema.oneOf;
  if (!members || members.length === 0) return undefined;
  const memberTypes = members.map(schemaTypes);
  if (memberTypes.some((types) => types === undefined)) return undefined;
  return memberTypes.flatMap((types) => types!);
};

const withoutStringKeywordsOnNonStrings = (schema: JsonSchema) => {
  const types = schemaTypes(schema);
  if (!types || types.includes('string')) return schema;
  const record = schema as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record).filter(
      ([key, value]) =>
        !(STRING_KEYWORDS as readonly string[]).includes(key) &&
        !(key === 'format' && STRING_FORMATS.has(value as string)),
    ),
  ) as JsonSchema;
};

const withItemConstraints = (
  schema: JsonSchema,
  itemConstraints: ValidationConstraints,
): JsonSchema =>
  withArrayItems(schema, (items) =>
    Array.isArray(items)
      ? items
      : applyPropertyConstraints(
          (items as JsonSchema | undefined) ?? {},
          itemConstraints,
        ),
  );

export const applyPropertyConstraints = (
  propertySchema: JsonSchema,
  constraints: ValidationConstraints | undefined,
): JsonSchema => {
  const applied = applyOwnConstraints(propertySchema, constraints);
  const withItems = constraints?.items
    ? withItemConstraints(applied, constraints.items)
    : applied;
  return withoutStringKeywordsOnNonStrings(withItems);
};

const applyOwnConstraints = (
  propertySchema: JsonSchema,
  constraints: ValidationConstraints | undefined,
): JsonSchema => {
  if (!constraints) return propertySchema;
  if (constraints.schemaOverride) {
    return applySchemaOverride(propertySchema, constraints);
  }

  const {
    type: typeOverride,
    enum: enumValues,
    ...restConstraints
  } = cleanPropertyConstraints(constraints);
  const withKeywords = { ...restConstraints, ...constraints.keywords };

  return (
    applyArrayItemConstraints(
      propertySchema,
      constraints.isArray,
      typeOverride,
      enumValues,
      withKeywords,
    ) ??
    applyDirectPropertyConstraints(
      propertySchema,
      typeOverride,
      enumValues,
      withKeywords,
    )
  );
};

const buildUpdatedProperties = (
  schema: JsonSchema,
  propertyConstraints: Record<string, ValidationConstraints>,
  hiddenProperties: ReadonlySet<string>,
): Record<string, JsonSchema> | undefined => {
  const shouldUpdateProperties =
    Object.keys(propertyConstraints).length > 0 || hiddenProperties.size > 0;

  if (!schema.properties || !shouldUpdateProperties) return undefined;
  return Object.fromEntries(
    Object.entries(schema.properties)
      .filter(([propertyName]) => !hiddenProperties.has(propertyName))
      .map(([propertyName, propertySchema]) => [
        propertyName,
        applyPropertyConstraints(
          propertySchema,
          propertyConstraints[propertyName],
        ),
      ]),
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

/**
 * Extracts class validation info, mapping a failure to `ValidationMappingError`.
 */
export const extractClassValidationInfoEffect = Effect.fn(
  'Validation.extractClassValidationInfo',
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
