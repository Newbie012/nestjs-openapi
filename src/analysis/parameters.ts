import { Option } from 'effect';
import type { DecoratorCall } from './decorators.js';
import type { ParameterLocation, ResolvedParameter } from '../model/domain.js';
import {
  DEFAULT_SCHEMA_NAMING,
  enumSchema,
  toSchemaJson,
  typeSchema,
  type EnumResolver,
  type SchemaNaming,
} from './property-schema.js';
import {
  asBoolean,
  asString,
  unwrapThunk,
  type StaticValue,
} from './static-value.js';
import type { OpenApiSchema } from '../config/types.js';

const DECORATOR_LOCATION: Readonly<Record<string, ParameterLocation>> = {
  ApiQuery: 'query',
  ApiParam: 'path',
  ApiHeader: 'header',
};

const DEFAULT_REQUIRED: Readonly<Partial<Record<ParameterLocation, boolean>>> =
  {
    query: true,
    path: true,
  };

const PARAMETER_KEYS = [
  'deprecated',
  'allowEmptyValue',
  'style',
  'explode',
  'allowReserved',
  'examples',
  'content',
] as const;

const SCHEMA_KEYS = [
  'properties',
  'patternProperties',
  'additionalProperties',
  'minimum',
  'maximum',
  'maxProperties',
  'minItems',
  'minProperties',
  'maxItems',
  'minLength',
  'maxLength',
  'exclusiveMaximum',
  'exclusiveMinimum',
  'uniqueItems',
  'title',
  'format',
  'pattern',
  'nullable',
  'default',
  'example',
  'oneOf',
  'anyOf',
] as const;

// @nestjs/swagger applies these to array items rather than the array
const ITEM_MODIFIER_KEYS = new Set(['format', 'maximum', 'minimum', 'pattern']);

type DeclaredParameter = {
  readonly name: string;
  readonly location: ParameterLocation;
  readonly required: boolean | undefined;
  readonly description: string | undefined;
  readonly schema: OpenApiSchema | undefined;
  readonly extra: Readonly<Record<string, unknown>>;
  // `@ApiQuery({ type: Dto })` without a name stands for Dto's properties
  readonly expandType: StaticValue | undefined;
};

const pickJson = (
  options: Readonly<Record<string, StaticValue>>,
  keys: readonly string[],
  naming: SchemaNaming,
): Record<string, unknown> =>
  Object.fromEntries(
    keys.flatMap((key) => {
      const value = toSchemaJson(options[key], naming);
      return value === undefined ? [] : [[key, value]];
    }),
  );

const declaredBaseSchema = (
  options: Readonly<Record<string, StaticValue>>,
  naming: SchemaNaming,
  resolveEnumValues: EnumResolver,
) => {
  const enumValues = resolveEnumValues(options['enum']);
  if (enumValues && enumValues.length > 0) {
    const enumOption = unwrapThunk(options['enum']);
    return enumSchema(
      enumValues,
      asString(options['enumName']),
      enumOption?.kind === 'reference'
        ? { name: enumOption.name, node: enumOption.node }
        : undefined,
      naming,
    ).override as OpenApiSchema;
  }
  const typeValue = unwrapThunk(options['type']);
  return typeSchema(
    typeValue?.kind === 'array' ? typeValue.items[0] : typeValue,
    naming,
  ) as OpenApiSchema | undefined;
};

// As @nestjs/swagger's SwaggerTypesMapper: an explicit `schema` is used as
// is; otherwise the type or enum with the schema keywords
const buildParameterSchema = (
  options: Readonly<Record<string, StaticValue>>,
  naming: SchemaNaming,
  resolveEnumValues: EnumResolver,
) => {
  const explicit = toSchemaJson(options['schema'], naming);
  if (explicit && typeof explicit === 'object')
    return explicit as OpenApiSchema;

  const keywords = pickJson(options, SCHEMA_KEYS, naming);
  const isArray =
    asBoolean(options['isArray']) === true ||
    unwrapThunk(options['type'])?.kind === 'array';
  const base = declaredBaseSchema(options, naming, resolveEnumValues);

  if (!base && Object.keys(keywords).length === 0) return undefined;

  if (isArray) {
    const itemKeywords = Object.fromEntries(
      Object.entries(keywords).filter(([key]) => ITEM_MODIFIER_KEYS.has(key)),
    );
    const arrayKeywords = Object.fromEntries(
      Object.entries(keywords).filter(([key]) => !ITEM_MODIFIER_KEYS.has(key)),
    );
    return {
      ...arrayKeywords,
      type: 'array',
      items: { ...(base ?? { type: 'string' }), ...itemKeywords },
    } as OpenApiSchema;
  }

  return { ...(base ?? {}), ...keywords } as OpenApiSchema;
};

const readDeclaration = (
  options: StaticValue | undefined,
  location: ParameterLocation,
  naming: SchemaNaming,
  resolveEnumValues: EnumResolver,
): DeclaredParameter | undefined => {
  if (options?.kind !== 'object') return undefined;
  const { properties } = options;
  const name = asString(properties['name']) ?? '';

  const typeValue = unwrapThunk(properties['type']);
  const expandType =
    location === 'query' && name === '' && typeValue?.kind === 'reference'
      ? typeValue
      : undefined;

  return {
    name,
    location,
    required: asBoolean(properties['required']),
    description: asString(properties['description']),
    schema: expandType
      ? undefined
      : buildParameterSchema(properties, naming, resolveEnumValues),
    extra: pickJson(properties, PARAMETER_KEYS, naming),
    expandType,
  };
};

export const readDeclaredParameters = (
  controllerCalls: readonly DecoratorCall[],
  methodCalls: readonly DecoratorCall[],
  resolveEnumValues: EnumResolver,
  naming: SchemaNaming = DEFAULT_SCHEMA_NAMING,
) => {
  const read = (calls: readonly DecoratorCall[]) =>
    calls.flatMap((call) => {
      if (call.name === 'ApiHeaders') {
        const list = call.args[0];
        return list?.kind === 'array'
          ? list.items.flatMap((item) => {
              const declared = readDeclaration(
                item,
                'header',
                naming,
                resolveEnumValues,
              );
              return declared ? [declared] : [];
            })
          : [];
      }
      const location = DECORATOR_LOCATION[call.name];
      const declared = location
        ? readDeclaration(call.args[0], location, naming, resolveEnumValues)
        : undefined;
      return declared ? [declared] : [];
    });

  // The method's own declarations win over the controller's
  const seen = new Set<string>();
  return [...read(methodCalls), ...read(controllerCalls)].filter((declared) => {
    const key = `${declared.location}:${declared.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const withDeclaration = (
  inferred: ResolvedParameter,
  declared: DeclaredParameter,
): ResolvedParameter => ({
  ...inferred,
  location: declared.location,
  required: declared.required ?? inferred.required,
  description: Option.orElse(
    Option.fromNullable(declared.description),
    () => inferred.description,
  ),
  ...(declared.schema ? { declaredSchema: declared.schema } : {}),
  extra: { ...(inferred.extra ?? {}), ...declared.extra },
});

const fromDeclaration = (declared: DeclaredParameter): ResolvedParameter => ({
  name: declared.name,
  location: declared.location,
  tsType: 'string',
  required:
    declared.location === 'path' ||
    (declared.required ?? DEFAULT_REQUIRED[declared.location] ?? false),
  description: Option.fromNullable(declared.description),
  ...(declared.schema ? { declaredSchema: declared.schema } : {}),
  extra: declared.extra,
});

// As in @nestjs/swagger, a declared parameter overrides the fields of the
// inferred one with its name (lodash `assign`), and the others are added
export const mergeDeclaredParameters = (
  inferred: readonly ResolvedParameter[],
  declared: readonly DeclaredParameter[],
  expand: (type: StaticValue) => readonly ResolvedParameter[],
): readonly ResolvedParameter[] => {
  const declaredByName = new Map<string, DeclaredParameter>();
  for (const parameter of declared) {
    if (parameter.expandType) continue;
    if (!declaredByName.has(parameter.name)) {
      declaredByName.set(parameter.name, parameter);
    }
  }

  const merged = inferred.map((parameter) => {
    const match = declaredByName.get(parameter.name);
    return match && parameter.location !== 'body'
      ? withDeclaration(parameter, match)
      : parameter;
  });

  const present = new Set(
    merged.map((parameter) => `${parameter.location}:${parameter.name}`),
  );
  for (const parameter of declared) {
    if (parameter.expandType) {
      for (const expanded of expand(parameter.expandType)) {
        const key = `${expanded.location}:${expanded.name}`;
        if (!present.has(key)) {
          present.add(key);
          merged.push(expanded);
        }
      }
      continue;
    }
    const key = `${parameter.location}:${parameter.name}`;
    if (!present.has(key) && parameter.name !== '') {
      present.add(key);
      merged.push(fromDeclaration(parameter));
    }
  }

  return merged;
};
