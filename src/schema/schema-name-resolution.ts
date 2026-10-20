import { Effect } from 'effect';
import { identifierPattern } from '../analysis/ast.js';
import { SchemaNameCollisionError } from '../config/errors.js';
import type {
  OpenApiPaths,
  OpenApiSchema,
  SchemaNameCollisionStrategy,
} from '../config/types.js';
import { SCHEMA_REF_PREFIX } from './schema-walk.js';
import {
  defaultCollisionNames,
  type SchemaNamePlan,
} from './schema-identity.js';
import { renameSchemaRefs } from './spec-compliance.js';

const IDENTIFIER = /[A-Za-z_$][\w$]*/g;

/** Two `enumName`s that name different values */
export interface EnumNameClash {
  readonly name: string;
  readonly values: readonly (readonly unknown[])[];
}

type Schemas = Readonly<Record<string, OpenApiSchema>>;

const refTarget = (ref: unknown) =>
  typeof ref === 'string' && ref.startsWith(SCHEMA_REF_PREFIX)
    ? ref.slice(SCHEMA_REF_PREFIX.length)
    : undefined;

const byJson = (a: unknown, b: unknown) =>
  JSON.stringify(a).localeCompare(JSON.stringify(b));

// Key order, `required` and `enum` order carry no meaning; a reference is
// replaced by what `refKey` says about its target
const normalize = (
  value: unknown,
  refKey: (name: string) => string,
  key?: string,
): unknown => {
  if (Array.isArray(value)) {
    const items = value.map((item) => normalize(item, refKey));
    return key === 'required' || key === 'enum' ? items.sort(byJson) : items;
  }
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((name) => {
        const target = name === '$ref' ? refTarget(record[name]) : undefined;
        return [
          name,
          target === undefined
            ? normalize(record[name], refKey, name)
            : refKey(target),
        ];
      }),
  );
};

/**
 * Groups components with equal schemas. A reference counts as equal when its
 * targets have the same name once the temporary names are resolved, and are
 * themselves equal; groups are split until stable, so recursive schemas
 * settle and a parent over differing children differs.
 */
export const equalSchemaGroups = (
  schemas: Schemas,
  plainName: (name: string) => string,
) => {
  const names = Object.keys(schemas);
  let groups = new Map(names.map((name) => [name, 0]));
  let count = 1;
  for (;;) {
    const refKey = (target: string) => {
      const group = groups.get(target);
      return group === undefined
        ? `ref:${target}`
        : `ref:${plainName(target)}#${group}`;
    };
    const ids = new Map<string, number>();
    const next = new Map<string, number>();
    for (const name of names) {
      const signature = `${groups.get(name)}|${JSON.stringify(
        normalize(schemas[name], refKey),
      )}`;
      if (!ids.has(signature)) ids.set(signature, ids.size);
      next.set(name, ids.get(signature)!);
    }
    groups = next;
    if (ids.size === count) return groups;
    count = ids.size;
  }
};

// Where two schemas differ: `properties.total`, or
// `properties.rows.items (RowDto differs)`
const differences = (
  a: unknown,
  b: unknown,
  describeRefs: (a: string, b: string) => string | undefined,
  path = '',
): string[] => {
  const at = path || '(root)';
  const refA =
    a && typeof a === 'object' ? refTarget((a as never)['$ref']) : undefined;
  const refB =
    b && typeof b === 'object' ? refTarget((b as never)['$ref']) : undefined;
  if (refA !== undefined && refB !== undefined) {
    const note = describeRefs(refA, refB);
    if (note !== undefined) return [`${at} (${note})`];
  }
  if (
    !a ||
    !b ||
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    Array.isArray(a) !== Array.isArray(b)
  ) {
    return JSON.stringify(a) === JSON.stringify(b) ? [] : [at];
  }
  if (Array.isArray(a)) {
    const listB = b as unknown[];
    if (a.length !== listB.length) return [at];
    return a.flatMap((item, index) =>
      differences(item, listB[index], describeRefs, `${path}[${index}]`),
    );
  }
  const recordA = a as Record<string, unknown>;
  const recordB = b as Record<string, unknown>;
  const keys = [
    ...new Set([...Object.keys(recordA), ...Object.keys(recordB)]),
  ].sort();
  return keys.flatMap((key) => {
    if (key === '$ref' && refA !== undefined && refB !== undefined) return [];
    const child = path ? `${path}.${key}` : key;
    if (!(key in recordA) || !(key in recordB)) return [child];
    const sortList = key === 'required' || key === 'enum';
    const valueA =
      sortList && Array.isArray(recordA[key])
        ? [...(recordA[key] as unknown[])].sort(byJson)
        : recordA[key];
    const valueB =
      sortList && Array.isArray(recordB[key])
        ? [...(recordB[key] as unknown[])].sort(byJson)
        : recordB[key];
    return differences(valueA, valueB, describeRefs, child);
  });
};

type Collision = {
  /** The shared name, `RowDto` or `ResultDto<string>` */
  readonly name: string;
  /** One list of files per group of equal schemas */
  readonly groups: readonly (readonly string[])[];
  readonly details: readonly string[];
};

const formatCollision = (collision: Collision) =>
  [
    `  ${collision.name}: ${collision.groups.flat().join(', ')}`,
    ...(collision.groups.some((files) => files.length > 1)
      ? [
          `    equal schemas: ${collision.groups
            .filter((files) => files.length > 1)
            .map((files) => files.join(' = '))
            .join('; ')}`,
        ]
      : []),
    ...collision.details.map((detail) => `    ${detail}`),
  ].join('\n');

const formatEnumNameClash = (clash: EnumNameClash) =>
  `  ${clash.name} (enumName): ${clash.values
    .map((values) => values.map((value) => JSON.stringify(value)).join(', '))
    .join(' | ')}`;

/**
 * Same-name declarations were generated under temporary names. Those with
 * equal schemas become one component under the shared name; the others, and
 * generic instantiations whose bodies differ, are what the collision
 * strategy decides about.
 */
export const resolveSchemaNames = Effect.fn('SchemaIdentity.resolve')(
  function* (
    paths: OpenApiPaths,
    schemas: Record<string, OpenApiSchema>,
    plan: SchemaNamePlan,
    strategy: SchemaNameCollisionStrategy,
    enumNameClashes: readonly EnumNameClash[] = [],
  ) {
    const shared = plan.shared;
    const unchanged = { paths, schemas, inline: new Set<string>() };
    if (shared.size === 0) {
      if (enumNameClashes.length > 0 && strategy === 'error') {
        return yield* failWith([], enumNameClashes);
      }
      yield* warnEnumClashes(enumNameClashes);
      return unchanged;
    }

    const plainName = (name: string) =>
      name.replace(IDENTIFIER, (id) => shared.get(id)?.name ?? id);
    const temporaryIn = (name: string) =>
      (name.match(IDENTIFIER) ?? []).filter((id) => shared.has(id));
    const groups = equalSchemaGroups(schemas, plainName);

    // The temporary names of each shared name, and the name the strategy
    // gives each declaration, asked only once one differs
    const byName = new Map<string, string[]>();
    for (const [temporary, entry] of shared) {
      byName.set(entry.name, [...(byName.get(entry.name) ?? []), temporary]);
    }
    const strategyNames = new Map<string, string>();
    const strategyName = (temporary: string) => {
      const known = strategyNames.get(temporary);
      if (known !== undefined) return known;
      const entry = shared.get(temporary)!;
      const siblings = byName.get(entry.name)!;
      const names =
        typeof strategy === 'function'
          ? siblings.map((sibling) => strategy(shared.get(sibling)!))
          : defaultCollisionNames(
              entry.name,
              siblings.map((sibling) => shared.get(sibling)!.relativePath),
            );
      for (const [index, sibling] of siblings.entries()) {
        strategyNames.set(sibling, names[index]!);
      }
      return strategyNames.get(temporary)!;
    };

    const describeRefs = (a: string, b: string) => {
      if (plainName(a) !== plainName(b)) return undefined;
      if (groups.get(a) === groups.get(b)) return undefined;
      return `${plainName(a)} differs`;
    };
    const collisions: Collision[] = [];
    const collisionFor = (
      name: string,
      members: readonly (readonly string[])[],
      files: (member: string) => string,
    ) => {
      const [first, second] = members.map((group) => group[0]!);
      collisions.push({
        name,
        groups: members.map((group) => group.map(files)),
        details: [
          `differ at ${differences(
            schemas[first!],
            schemas[second!],
            describeRefs,
          )
            .slice(0, 3)
            .join(', ')}`,
        ],
      });
    };
    const fileOf = (component: string) =>
      shared.get(temporaryIn(component)[0]!)!.relativePath;

    // A declaration differs from its namesakes when their components do
    const resolved = new Map<string, string>();
    const split = new Set<string>();
    for (const [name, temporaries] of byName) {
      const components = temporaries.filter((temporary) => schemas[temporary]);
      const classes = groupBy(
        components,
        (temporary) => groups.get(temporary)!,
      );
      if (classes.length <= 1) {
        for (const temporary of temporaries) resolved.set(temporary, name);
        continue;
      }
      collisionFor(name, classes, fileOf);
      const withoutComponent = temporaries.filter(
        (temporary) => !schemas[temporary],
      );
      for (const members of [...classes, ...withoutComponent.map((t) => [t])]) {
        const finalName = strategyName(members[0]!);
        for (const temporary of members) {
          resolved.set(temporary, finalName);
          split.add(finalName);
        }
      }
    }

    // Generic instantiations: compared by what they are named once the
    // declarations above are resolved, `ResultDto<string>`
    const renames = new Map<string, string>();
    const instantiations = new Map<string, string[]>();
    for (const component of Object.keys(schemas)) {
      if (shared.has(component)) {
        renames.set(component, resolved.get(component)!);
        continue;
      }
      if (temporaryIn(component).length === 0) continue;
      const text = component.replace(
        IDENTIFIER,
        (id) => resolved.get(id) ?? id,
      );
      instantiations.set(text, [
        ...(instantiations.get(text) ?? []),
        component,
      ]);
    }
    for (const [text, components] of instantiations) {
      const sorted = [...components].sort((a, b) =>
        fileOf(a).localeCompare(fileOf(b)),
      );
      const classes = groupBy(sorted, (component) => groups.get(component)!);
      if (classes.length <= 1) {
        for (const component of components) renames.set(component, text);
        continue;
      }
      collisionFor(text, classes, fileOf);
      for (const members of classes) {
        // The declarations still under their shared name are the ones this
        // instantiation tells apart
        const finalName = members[0]!.replace(IDENTIFIER, (id) => {
          if (!shared.has(id)) return id;
          const name = resolved.get(id)!;
          if (name !== shared.get(id)!.name) return name;
          const distinct = strategyName(id);
          split.add(distinct);
          return distinct;
        });
        for (const component of members) renames.set(component, finalName);
      }
    }

    collisions.sort((a, b) => a.name.localeCompare(b.name));
    if (
      (collisions.length > 0 || enumNameClashes.length > 0) &&
      strategy === 'error'
    ) {
      return yield* failWith(collisions, enumNameClashes);
    }

    // Names the strategy returned must be given, unique and new
    const empty = [...strategyNames].find(
      ([, name]) => typeof name !== 'string' || name.length === 0,
    );
    if (empty) {
      const entry = shared.get(empty[0])!;
      return yield* Effect.fail(
        new SchemaNameCollisionError({
          message: `options.schemaNameCollision returned no name for ${entry.name} in ${entry.relativePath}`,
          names: [entry.name],
        }),
      );
    }
    const owners = new Map<string, string>();
    for (const [component, finalName] of renames) {
      const owner = owners.get(finalName);
      if (owner === undefined) {
        owners.set(finalName, component);
      } else if (groups.get(owner) !== groups.get(component)) {
        return yield* Effect.fail(
          new SchemaNameCollisionError({
            message: `options.schemaNameCollision returned "${finalName}" for both ${plainName(owner)} in ${fileOf(owner)} and ${plainName(component)} in ${fileOf(component)}; names must be unique`,
            names: [...new Set([plainName(owner), plainName(component)])],
          }),
        );
      }
      if (
        split.has(finalName) &&
        schemas[finalName] &&
        !renames.has(finalName)
      ) {
        return yield* Effect.fail(
          new SchemaNameCollisionError({
            message: `options.schemaNameCollision named ${plainName(component)} in ${fileOf(component)} "${finalName}", which is already the name of another schema`,
            names: [plainName(component)],
          }),
        );
      }
    }

    // Equal schemas share one component: the declaration from the first file
    const representatives = new Map<string, string>();
    for (const component of [...renames.keys()].sort((a, b) =>
      fileOf(a).localeCompare(fileOf(b)),
    )) {
      const finalName = renames.get(component)!;
      if (!representatives.has(finalName)) {
        representatives.set(finalName, component);
      }
    }
    // Components under their own names first: a resolved one wins its name
    const resolvedSchemas: Record<string, OpenApiSchema> = {};
    for (const [name, schema] of Object.entries(schemas)) {
      if (renames.has(name)) continue;
      resolvedSchemas[name] = renameSchemaRefs(
        schema,
        renames,
      ) as OpenApiSchema;
    }
    for (const [finalName, component] of representatives) {
      resolvedSchemas[finalName] = renameSchemaRefs(
        schemas[component],
        renames,
      ) as OpenApiSchema;
    }

    if (strategy === 'inline') {
      for (const collision of collisions) {
        yield* Effect.logWarning(
          `Schema name "${collision.name}" is shared by different schemas; they are inlined where used`,
        ).pipe(
          Effect.annotateLogs({
            name: collision.name,
            declarations: collision.groups.flat().join(', '),
          }),
        );
      }
    }
    yield* warnEnumClashes(enumNameClashes);

    // 'inline': the differing components are written in place, and so are
    // instantiations over them, `PageDto<Shipping_AddressDto>`
    const patterns = [...split].map((name) => identifierPattern(name));
    const inline =
      strategy === 'inline'
        ? new Set(
            Object.keys(resolvedSchemas).filter((name) =>
              patterns.some((pattern) => pattern.test(name)),
            ),
          )
        : new Set<string>();

    return {
      paths: renameSchemaRefs(paths, renames) as OpenApiPaths,
      schemas: resolvedSchemas,
      inline,
    };
  },
);

const groupBy = <T>(items: readonly T[], key: (item: T) => number) => {
  const groups = new Map<number, T[]>();
  for (const item of items) {
    groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  }
  return [...groups.values()];
};

const failWith = (
  collisions: readonly Collision[],
  enumNameClashes: readonly EnumNameClash[],
) =>
  Effect.fail(
    new SchemaNameCollisionError({
      message: `Different schemas share a name:\n${[
        ...collisions.map(formatCollision),
        ...enumNameClashes.map(formatEnumNameClash),
      ].join(
        '\n',
      )}\nRename them, or set options.schemaNameCollision to 'inline' or 'rename'.`,
      names: [
        ...collisions.map((collision) => collision.name),
        ...enumNameClashes.map((clash) => clash.name),
      ],
    }),
  );

const warnEnumClashes = (clashes: readonly EnumNameClash[]) =>
  Effect.forEach(
    clashes,
    (clash) =>
      Effect.logWarning(
        `enumName "${clash.name}" names different values; they are written in place where used`,
      ),
    { discard: true },
  );
