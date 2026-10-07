import type { Node } from 'ts-morph';
import type { JsonSchema } from '../schema/schema-generator.js';
import {
  asBoolean,
  asString,
  schemaRefPath,
  toPlain,
  unwrapThunk,
  type StaticValue,
} from './static-value.js';

export type EnumStyle = 'nest' | 'ref';

export const DEFAULT_ENUM_STYLE: EnumStyle = 'ref';

export type SchemaNaming = {
  // Collision handling may name a declaration differently from its
  // TypeScript name
  readonly componentName: (name: string, node: Node | undefined) => string;
  readonly enums?: EnumStyle;
};

export const DEFAULT_SCHEMA_NAMING: SchemaNaming = {
  componentName: (name) => name,
  enums: DEFAULT_ENUM_STYLE,
};

type DeclaredPropertySchema = {
  readonly override?: JsonSchema;
  readonly keywords: Record<string, unknown>;
  readonly enumComponent?: {
    readonly name: string;
    readonly schema: JsonSchema;
  };
};

export type EnumValue = string | number;

export type EnumResolver = (
  value: StaticValue | undefined,
) => readonly EnumValue[] | undefined;

const TYPE_OPTIONS = new Set([
  'type',
  'isArray',
  'enum',
  'enumName',
  'items',
  'oneOf',
  'anyOf',
  'allOf',
  'required',
  'name',
  'selfRequired',
  'enumSchema',
]);

// Read elsewhere into typed constraints, so not copied twice
const TYPED_KEYWORDS = new Set([
  'description',
  'title',
  'format',
  'pattern',
  'minimum',
  'maximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'uniqueItems',
  'deprecated',
  'readOnly',
  'writeOnly',
  'nullable',
  'example',
  'default',
]);

const PRIMITIVE_CONSTRUCTORS: Readonly<Record<string, JsonSchema>> = {
  String: { type: 'string' },
  Number: { type: 'number' },
  Boolean: { type: 'boolean' },
  Object: { type: 'object' },
  Array: { type: 'array' },
  Date: { type: 'string', format: 'date-time' },
  Buffer: { type: 'string', format: 'binary' },
};

const PRIMITIVE_TYPE_NAMES: Readonly<Record<string, JsonSchema>> = {
  string: { type: 'string' },
  number: { type: 'number' },
  integer: { type: 'integer' },
  boolean: { type: 'boolean' },
  object: { type: 'object' },
  array: { type: 'array' },
  null: { type: 'null' },
  file: { type: 'string', format: 'binary' },
};

export const toSchemaJson = (
  value: StaticValue | undefined,
  naming: SchemaNaming,
): unknown =>
  value === undefined
    ? undefined
    : toPlain(value, (opaque) => {
        if (opaque.kind === 'schemaRef') {
          return schemaRefPath(naming.componentName(opaque.name, opaque.node));
        }
        if (opaque.kind === 'reference') {
          // A class used where a schema is expected: `items: { type: Dto }`
          return typeSchema(opaque, naming);
        }
        if (opaque.kind === 'thunk') return toSchemaJson(opaque.value, naming);
        return undefined;
      });

export const typeSchema = (
  value: StaticValue | undefined,
  naming: SchemaNaming,
): JsonSchema | undefined => {
  const unwrapped = unwrapThunk(value);
  if (!unwrapped) return undefined;

  if (unwrapped.kind === 'array') {
    const items = typeSchema(unwrapped.items[0], naming);
    return items ? { type: 'array', items } : { type: 'array' };
  }
  if (unwrapped.kind === 'reference') {
    return (
      PRIMITIVE_CONSTRUCTORS[unwrapped.name] ?? {
        $ref: schemaRefPath(
          naming.componentName(unwrapped.name, unwrapped.node),
        ),
      }
    );
  }
  const name = asString(unwrapped);
  return name !== undefined ? PRIMITIVE_TYPE_NAMES[name] : undefined;
};

// Marks an enum named on purpose (`enumName`): the 'nest' enum style keeps
// it while inlining enums inferred from TypeScript types
export const NAMED_ENUM_REF: unique symbol = Symbol('namedEnumRef');

const enumValueType = (values: readonly EnumValue[]) =>
  values.length > 0 && values.every((value) => typeof value === 'number')
    ? 'number'
    : 'string';

export const enumSchema = (
  values: readonly EnumValue[],
  enumName: string | undefined,
  referencedEnum: { readonly name: string; readonly node?: Node } | undefined,
  naming: SchemaNaming,
): Pick<DeclaredPropertySchema, 'override' | 'enumComponent'> => {
  const inline: JsonSchema = { type: enumValueType(values), enum: [...values] };
  const componentName =
    enumName ??
    (naming.enums === 'ref' && referencedEnum
      ? naming.componentName(referencedEnum.name, referencedEnum.node)
      : undefined);

  if (componentName) {
    return {
      override: {
        $ref: schemaRefPath(componentName),
        [NAMED_ENUM_REF]: true,
      } as JsonSchema,
      enumComponent: { name: componentName, schema: inline },
    };
  }
  return { override: inline };
};

const wrapArray = (schema: JsonSchema, isArray: boolean) =>
  isArray && schema.type !== 'array'
    ? { type: 'array', items: schema }
    : schema;

// As in @nestjs/swagger, what the decorator says about the type replaces the
// type inferred from TypeScript, and every other keyword is copied
const sameValues = (
  values: readonly EnumValue[],
  others: readonly EnumValue[] | undefined,
) =>
  others !== undefined &&
  values.length === others.length &&
  values.every((value) => others.includes(value));

export const readDeclaredPropertySchema = (
  options: StaticValue | undefined,
  naming: SchemaNaming,
  resolveEnumValues: EnumResolver,
  inferredEnumValues: () => readonly EnumValue[] | undefined = () => undefined,
): DeclaredPropertySchema => {
  if (options?.kind !== 'object') return { keywords: {} };
  const { properties } = options;
  const isArray = asBoolean(properties['isArray']) ?? false;

  const keywords = Object.fromEntries(
    Object.entries(properties).flatMap(([key, value]) => {
      if (TYPE_OPTIONS.has(key) || TYPED_KEYWORDS.has(key)) return [];
      const json = toSchemaJson(value, naming);
      return json === undefined ? [] : [[key, json]];
    }),
  );

  const enumOption = properties['enum'];
  if (enumOption !== undefined) {
    const values = resolveEnumValues(enumOption);
    if (values && values.length > 0) {
      const unwrapped = unwrapThunk(enumOption);
      const referencedEnum =
        unwrapped?.kind === 'reference'
          ? { name: unwrapped.name, node: unwrapped.node }
          : undefined;
      const enumName = asString(properties['enumName']);
      // Values alone (`Object.values(Status)`, a literal array) name no
      // enum: in 'ref' style the TypeScript type, when it has the same
      // values, keeps its component
      if (
        naming.enums === 'ref' &&
        enumName === undefined &&
        referencedEnum === undefined &&
        sameValues(values, inferredEnumValues())
      ) {
        return { keywords };
      }
      const { override, enumComponent } = enumSchema(
        values,
        enumName,
        referencedEnum,
        naming,
      );
      return {
        override: override && wrapArray(override, isArray),
        keywords,
        ...(enumComponent ? { enumComponent } : {}),
      };
    }
  }

  for (const composition of ['oneOf', 'anyOf', 'allOf'] as const) {
    const value = properties[composition];
    if (value?.kind === 'array') {
      const members = toSchemaJson(value, naming) as JsonSchema[];
      return {
        override: wrapArray({ [composition]: members } as JsonSchema, isArray),
        keywords,
      };
    }
  }

  const items = properties['items'];
  if (items !== undefined) {
    const itemSchema = toSchemaJson(items, naming) as JsonSchema | undefined;
    if (itemSchema && typeof itemSchema === 'object') {
      return { override: { type: 'array', items: itemSchema }, keywords };
    }
  }

  const declaredType = typeSchema(properties['type'], naming);
  if (declaredType) {
    return { override: wrapArray(declaredType, isArray), keywords };
  }

  return { keywords };
};

export const allowsNull = (schema: JsonSchema) =>
  schema.nullable === true ||
  (Array.isArray(schema.type) && schema.type.includes('null')) ||
  (schema.anyOf ?? []).some((member) => member.type === 'null') ||
  (schema.oneOf ?? []).some((member) => member.type === 'null');

export const isArraySchema = (schema: JsonSchema) =>
  schema.type === 'array' ||
  (Array.isArray(schema.type) && schema.type.includes('array')) ||
  (schema.anyOf ?? []).some((member) => member.type === 'array');
