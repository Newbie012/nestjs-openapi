import type { OpenApiSchema } from './types.js';

/**
 * Expands the JSON Schema `const` keyword into a single-value `enum`.
 *
 * `ts-json-schema-generator` emits `const` for any type with exactly one
 * inhabitant — a string literal property, or a single-member enum, whose
 * declared type collapses to that member. OpenAPI only adopted `const` in
 * 3.1, so a 3.0 spec carrying it is invalid, and tooling that does not know
 * the keyword reads the schema as unconstrained.
 *
 * `enum: [value]` says the same thing and is valid in every OpenAPI version,
 * so single- and multi-member enums come out in the same shape.
 */

/** A schema carrying `const`, which `OpenApiSchema` itself does not define. */
type SchemaWithConst = OpenApiSchema & { readonly const?: unknown };

const hasConstKeyword = (schema: OpenApiSchema): boolean =>
  Object.prototype.hasOwnProperty.call(schema, 'const');

const mapProperties = (
  properties: Record<string, OpenApiSchema>,
): Record<string, OpenApiSchema> =>
  Object.fromEntries(
    Object.entries(properties).map(([name, property]) => [
      name,
      expandConstInSchema(property),
    ]),
  );

/**
 * Rewrites `const` as a single-value `enum` throughout a schema.
 *
 * An existing `enum` wins: it already constrains the value, so `const` is
 * dropped rather than overwriting it.
 */
export const expandConstInSchema = (schema: OpenApiSchema): OpenApiSchema => {
  const expandedOneOf = schema.oneOf?.map(expandConstInSchema);
  const expandedAnyOf = schema.anyOf?.map(expandConstInSchema);
  const expandedAllOf = schema.allOf?.map(expandConstInSchema);
  const expandedItems = schema.items
    ? expandConstInSchema(schema.items)
    : undefined;
  const expandedProperties = schema.properties
    ? mapProperties(schema.properties)
    : undefined;
  const expandedAdditionalProperties =
    schema.additionalProperties &&
    typeof schema.additionalProperties === 'object'
      ? expandConstInSchema(schema.additionalProperties)
      : schema.additionalProperties;

  const { const: constValue, ...rest } = schema as SchemaWithConst;
  const expandedEnum = hasConstKeyword(schema)
    ? (schema.enum ?? [constValue])
    : schema.enum;

  return {
    ...rest,
    ...(expandedEnum && { enum: expandedEnum }),
    ...(expandedOneOf && { oneOf: expandedOneOf }),
    ...(expandedAnyOf && { anyOf: expandedAnyOf }),
    ...(expandedAllOf && { allOf: expandedAllOf }),
    ...(expandedItems && { items: expandedItems }),
    ...(expandedProperties && { properties: expandedProperties }),
    ...(expandedAdditionalProperties !== undefined && {
      additionalProperties: expandedAdditionalProperties,
    }),
  };
};

/** Applies {@link expandConstInSchema} to every schema in a components map */
export const expandConstSchemas = (
  schemas: Record<string, OpenApiSchema>,
): Record<string, OpenApiSchema> =>
  Object.fromEntries(
    Object.entries(schemas).map(([name, schema]) => [
      name,
      expandConstInSchema(schema),
    ]),
  );
