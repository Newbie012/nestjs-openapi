import type { OpenApiSchema } from '../config/types.js';

/** The parts of a schema that can say it allows `null`. */
interface NullableShape {
  readonly nullable?: boolean;
  readonly type?: string | readonly string[];
  readonly anyOf?: readonly { readonly type?: string | readonly string[] }[];
  readonly oneOf?: readonly { readonly type?: string | readonly string[] }[];
}

const isNullMember = (member: { readonly type?: string | readonly string[] }) =>
  member.type === 'null';

/**
 * True when a schema allows `null` in any of the forms the generator reads:
 * `nullable: true` (3.0), a type list with `'null'` (3.1+), or an `anyOf` or
 * `oneOf` member of type `'null'`.
 */
export const isNullable = (schema: NullableShape): boolean =>
  schema.nullable === true ||
  (Array.isArray(schema.type) && schema.type.includes('null')) ||
  (schema.anyOf ?? []).some(isNullMember) ||
  (schema.oneOf ?? []).some(isNullMember);

/**
 * Allows `null` on a schema in the 3.0 form. A reference is wrapped in
 * `allOf`, because 3.0 ignores keywords beside `$ref`.
 */
export const withNull = (schema: OpenApiSchema): OpenApiSchema =>
  schema.$ref
    ? { allOf: [{ $ref: schema.$ref }], nullable: true }
    : { ...schema, nullable: true };
