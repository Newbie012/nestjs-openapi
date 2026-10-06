import { Effect, Option } from 'effect';
import { dirname, join, relative } from 'node:path';
import type { Node, Project } from 'ts-morph';
import {
  getTopLevelTypeNames,
  identifierPattern,
  resolveDeclarations,
} from './ast.js';
import { declarationKey } from './declaration-references.js';
import type {
  DeclarationRef,
  MethodInfo,
  ResolvedParameter,
} from './domain.js';
import { SchemaNameCollisionError } from './errors.js';
import type { EnumStyle, SchemaNaming } from './property-schema.js';
import { getRunProject } from './run-project.js';
import {
  generateNamedSchemas,
  generateSchemasFromVirtualFile,
} from './schema-generator.js';
import type { GeneratedSchemas, JsonSchema } from './schema-generator.js';
import type {
  SchemaNameCollision,
  SchemaNameCollisionStrategy,
} from './types.js';

type PlannedDeclaration = {
  readonly ref: DeclarationRef;
  readonly name: string;
};

type SchemaNamePlan = {
  readonly declarations: ReadonlyMap<string, PlannedDeclaration>;
  readonly inline: ReadonlySet<string>;
};

export const EMPTY_PLAN: SchemaNamePlan = {
  declarations: new Map(),
  inline: new Set(),
};

const declaredNamesCache = new Map<string, ReadonlySet<string>>();

const getDeclaredNames = (filePath: string) => {
  const cached = declaredNamesCache.get(filePath);
  if (cached) return cached;
  const names = new Set(getTopLevelTypeNames(filePath));
  declaredNamesCache.set(filePath, names);
  return names;
};

const collectReachable = (methods: readonly MethodInfo[]) => {
  const reachable = new Map<string, DeclarationRef>();
  for (const method of methods) {
    for (const ref of method.referencedDeclarations ?? []) {
      reachable.set(declarationKey(ref), ref);
    }
  }
  return reachable;
};

const toPascalCase = (text: string) =>
  text
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => `${word[0]!.toUpperCase()}${word.slice(1)}`)
    .join('');

const pathSegments = (relativePath: string) => {
  const segments = relativePath.split(/[\\/]/).filter(Boolean);
  const file = (segments.pop() ?? '')
    .replace(/\.(d\.)?[cm]?tsx?$/, '')
    .replace(/\.dto$/, '');
  return [...segments, file];
};

export const defaultCollisionNames = (
  name: string,
  relativePaths: readonly string[],
) => {
  const segments = relativePaths.map(pathSegments);
  const maxDepth = Math.max(...segments.map((parts) => parts.length));

  for (let depth = 1; depth <= maxDepth; depth++) {
    const prefixes = segments.map((parts) =>
      toPascalCase(parts.slice(-depth).join('-')),
    );
    if (new Set(prefixes).size === prefixes.length) {
      return prefixes.map((prefix) => `${prefix}_${name}`);
    }
  }

  return relativePaths.map((_, index) => `${name}_${index + 1}`);
};

const formatCollisions = (
  collisions: ReadonlyMap<string, readonly SchemaNameCollision[]>,
) =>
  [...collisions]
    .map(
      ([name, declarations]) =>
        `  ${name}: ${declarations.map((declaration) => declaration.relativePath).join(', ')}`,
    )
    .join('\n');

export const planSchemaNames = Effect.fn('SchemaIdentity.plan')(function* (
  methods: readonly MethodInfo[],
  candidateFiles: readonly string[],
  strategy: SchemaNameCollisionStrategy,
  baseDir: string,
) {
  declaredNamesCache.clear();

  const reachable = collectReachable(methods);

  const byName = new Map<string, DeclarationRef[]>();
  for (const ref of reachable.values()) {
    byName.set(ref.name, [...(byName.get(ref.name) ?? []), ref]);
  }

  const toRelative = (filePath: string) =>
    relative(baseDir, filePath).split('\\').join('/');

  const collisions = new Map<string, SchemaNameCollision[]>();
  for (const [name, refs] of byName) {
    if (refs.length < 2) continue;
    const sorted = [...refs].sort((a, b) =>
      a.filePath.localeCompare(b.filePath),
    );
    const declarations = sorted.map((ref) => ({
      filePath: ref.filePath,
      relativePath: toRelative(ref.filePath),
      exported: ref.exported,
    }));
    collisions.set(
      name,
      sorted.map((ref) => ({
        name,
        filePath: ref.filePath,
        relativePath: toRelative(ref.filePath),
        exported: ref.exported,
        kind: ref.kind,
        declarations,
      })),
    );
  }

  if (collisions.size > 0 && strategy === 'error') {
    return yield* Effect.fail(
      new SchemaNameCollisionError({
        message: `Different declarations share a schema name:\n${formatCollisions(collisions)}\nRename them, or set options.schemaNameCollision to 'inline' or 'rename'.`,
        names: [...collisions.keys()],
      }),
    );
  }

  const declarations = new Map<string, PlannedDeclaration>();
  const inline = new Set<string>();
  const otherSchemaNames = new Set(
    [...byName.keys()].filter((name) => !collisions.has(name)),
  );
  const assigned = new Map<string, SchemaNameCollision>();

  for (const [name, entries] of collisions) {
    const finalNames =
      typeof strategy === 'function'
        ? entries.map((entry) => strategy(entry))
        : defaultCollisionNames(
            name,
            entries.map((entry) => entry.relativePath),
          );

    for (const [index, entry] of entries.entries()) {
      const finalName = finalNames[index]!;
      if (typeof finalName !== 'string' || finalName.length === 0) {
        return yield* Effect.fail(
          new SchemaNameCollisionError({
            message: `options.schemaNameCollision returned no name for ${name} in ${entry.relativePath}`,
            names: [name],
          }),
        );
      }
      if (otherSchemaNames.has(finalName)) {
        return yield* Effect.fail(
          new SchemaNameCollisionError({
            message: `options.schemaNameCollision named ${name} in ${entry.relativePath} "${finalName}", which is already the name of another schema`,
            names: [name],
          }),
        );
      }
      const previous = assigned.get(finalName);
      if (previous) {
        return yield* Effect.fail(
          new SchemaNameCollisionError({
            message: `options.schemaNameCollision returned "${finalName}" for both ${previous.name} in ${previous.relativePath} and ${name} in ${entry.relativePath}; names must be unique`,
            names: [...new Set([previous.name, name])],
          }),
        );
      }
      assigned.set(finalName, entry);
      const ref = reachable.get(declarationKey(entry))!;
      declarations.set(declarationKey(ref), { ref, name: finalName });
      if (strategy === 'inline') inline.add(finalName);
    }

    if (strategy === 'inline') {
      yield* Effect.logWarning(
        `Schema name "${name}" is shared by different declarations; their schemas are inlined where used`,
      ).pipe(
        Effect.annotateLogs({
          name,
          declarations: entries.map((entry) => entry.relativePath).join(', '),
        }),
      );
    }
  }

  // A name reached through one declaration can still be shadowed by another
  // declaration elsewhere (an unused exported class with the same name); the
  // schema generated under that name may come from the wrong one.
  const files = [
    ...new Set([
      ...candidateFiles,
      ...[...reachable.values()].map((ref) => ref.filePath),
    ]),
  ];
  for (const [name, refs] of byName) {
    if (refs.length !== 1) continue;
    const [ref] = refs;
    const shadowed = files.some(
      (filePath) =>
        filePath !== ref!.filePath && getDeclaredNames(filePath).has(name),
    );
    if (shadowed) {
      declarations.set(declarationKey(ref!), { ref: ref!, name });
    }
  }

  return { declarations, inline } as SchemaNamePlan;
});

const replaceName = (text: string, from: string, to: string) =>
  text.replace(identifierPattern(from, 'g'), to);

export const applyPlanToMethods = (
  methods: readonly MethodInfo[],
  plan: SchemaNamePlan,
) =>
  methods.map((method) => {
    // The operation names a declaration by its own name or an import alias;
    // both become the planned name, or the declaration's name if unplanned
    const renames = (method.referencedDeclarations ?? []).flatMap((ref) => {
      if (!ref.topLevel) return [];
      const target =
        plan.declarations.get(declarationKey(ref))?.name ?? ref.name;
      return [ref.name, ...(ref.localNames ?? [])]
        .filter((localName) => localName !== target)
        .map((localName) => [localName, target] as const);
    });
    if (renames.length === 0) return method;

    const rename = (text: string) =>
      renames.reduce(
        (result, [from, to]) => replaceName(result, from, to),
        text,
      );
    const renameRefs = <T>(value: T): T =>
      value === undefined
        ? value
        : (JSON.parse(
            renames.reduce(
              (text, [from, to]) =>
                text
                  .split(`"#/components/schemas/${from}"`)
                  .join(`"#/components/schemas/${to}"`),
              JSON.stringify(value),
            ),
          ) as T);
    const renameOption = (option: Option.Option<string>) =>
      Option.map(option, rename);

    return {
      ...method,
      ...(method.extraModels
        ? { extraModels: method.extraModels.map(rename) }
        : {}),
      returnType: {
        ...method.returnType,
        type: renameOption(method.returnType.type),
      },
      parameters: method.parameters.map((parameter: ResolvedParameter) => ({
        ...parameter,
        tsType: rename(parameter.tsType),
        ...(parameter.declaredSchema
          ? { declaredSchema: renameRefs(parameter.declaredSchema) }
          : {}),
      })),
      responses: method.responses.map((response) => ({
        ...response,
        type: renameOption(response.type),
        ...(response.schema !== undefined
          ? { schema: renameRefs(response.schema) }
          : {}),
      })),
      ...(method.requestBody
        ? {
            requestBody: {
              ...method.requestBody,
              type: renameOption(method.requestBody.type),
              ...(method.requestBody.schema !== undefined
                ? { schema: renameRefs(method.requestBody.schema) }
                : {}),
            },
          }
        : {}),
    };
  });

export const namingForPlan = (
  plan: SchemaNamePlan,
  enums: EnumStyle,
): SchemaNaming => ({
  enums,
  componentName: (name, node) => {
    if (!node || plan.declarations.size === 0) return name;
    for (const declaration of resolveDeclarations(node)) {
      const filePath = declaration.getSourceFile().getFilePath();
      const declaredName = (
        declaration as Node & { getName?(): string }
      ).getName?.();
      if (!declaredName) continue;
      const planned = plan.declarations.get(
        declarationKey({ filePath, name: declaredName }),
      );
      if (planned) return planned.name;
    }
    return name;
  },
});

const findDeclarationNameNode = (project: Project, ref: DeclarationRef) => {
  const sourceFile = project.getSourceFile(ref.filePath);
  if (!sourceFile) return undefined;
  const declarations: Record<
    DeclarationRef['kind'],
    () => { getNameNode(): Node | undefined } | undefined
  > = {
    class: () => sourceFile.getClass(ref.name),
    interface: () => sourceFile.getInterface(ref.name),
    enum: () => sourceFile.getEnum(ref.name),
    type: () => sourceFile.getTypeAlias(ref.name),
  };
  return declarations[ref.kind]()?.getNameNode();
};

type RegeneratedSchemas = {
  readonly forced: GeneratedSchemas;
  readonly extra: GeneratedSchemas;
  readonly sources: ReadonlyMap<string, DeclarationRef>;
};

type RenamedGeneric = {
  readonly internalText: string;
  readonly finalText: string;
  readonly imports: ReadonlyMap<string, string>;
};

const GENERIC_TYPE = /^([A-Za-z_$][\w$]*<.+>)(?:\[\])*$/;

const collectRenamedGenerics = (
  methods: readonly MethodInfo[],
  plan: SchemaNamePlan,
  internalNames: ReadonlyMap<string, string>,
  reachable: ReadonlyMap<string, DeclarationRef>,
) => {
  const fileOf = new Map<string, string>();
  for (const ref of reachable.values()) {
    if (!plan.declarations.has(declarationKey(ref)))
      fileOf.set(ref.name, ref.filePath);
  }

  const generics = new Map<string, RenamedGeneric>();
  for (const method of methods) {
    const toInternal: (readonly [string, string, string])[] = [];
    for (const ref of method.referencedDeclarations ?? []) {
      const key = declarationKey(ref);
      const internal = internalNames.get(key);
      const planned = plan.declarations.get(key);
      if (!ref.topLevel || !internal || !planned) continue;
      for (const localName of [ref.name, ...(ref.localNames ?? [])]) {
        toInternal.push([localName, internal, planned.name]);
      }
    }
    if (toInternal.length === 0) continue;

    const texts = [
      Option.getOrUndefined(method.returnType.type),
      ...method.responses.map((response) =>
        Option.getOrUndefined(response.type),
      ),
      method.requestBody
        ? Option.getOrUndefined(method.requestBody.type)
        : undefined,
      ...method.parameters.map((parameter) => parameter.tsType),
    ];
    for (const text of texts) {
      const generic = text?.match(GENERIC_TYPE)?.[1];
      if (!generic) continue;
      const used = toInternal.filter(([localName]) =>
        identifierPattern(localName).test(generic),
      );
      if (used.length === 0) continue;

      const internalText = used.reduce(
        (result, [localName, internal]) =>
          replaceName(result, localName, internal),
        generic,
      );
      const finalText = used.reduce(
        (result, [localName, , finalName]) =>
          replaceName(result, localName, finalName),
        generic,
      );
      const imports = new Map<string, string>();
      for (const identifier of internalText.match(/[A-Za-z_$][\w$]*/g) ?? []) {
        const internalRef = [...internalNames].find(
          ([, name]) => name === identifier,
        );
        const filePath = internalRef
          ? plan.declarations.get(internalRef[0])?.ref.filePath
          : fileOf.get(identifier);
        if (filePath) imports.set(identifier, filePath);
      }
      generics.set(internalText, { internalText, finalText, imports });
    }
  }
  return [...generics.values()];
};

const toImportPath = (fromFile: string, toFile: string) => {
  const path = relative(dirname(fromFile), toFile)
    .split('\\')
    .join('/')
    .replace(/\.tsx?$/, '');
  return path.startsWith('.') ? path : `./${path}`;
};

const renameInSchemas = (
  definitions: Record<string, JsonSchema>,
  renames: ReadonlyMap<string, string>,
) => {
  if (renames.size === 0) return definitions;
  let text = JSON.stringify(definitions);
  for (const [from, to] of renames) {
    text = replaceName(text, from, to);
  }
  return JSON.parse(text) as Record<string, JsonSchema>;
};

export const regenerateDeclarations = Effect.fn('SchemaIdentity.regenerate')(
  function* (
    plan: SchemaNamePlan,
    methods: readonly MethodInfo[],
    tsconfig: string,
  ) {
    if (plan.declarations.size === 0) {
      return {
        forced: { definitions: {} },
        extra: { definitions: {} },
        sources: new Map(),
      } as RegeneratedSchemas;
    }

    const reachable = collectReachable(methods);

    // Each planned declaration gets a unique internal name, with every
    // reference to it. Rename locations are all found on the unchanged
    // program and applied as text to an in-memory overlay: modifying the
    // shared project would rebuild its type checker.
    const project = getRunProject(tsconfig);
    project.addSourceFilesAtPaths([
      ...new Set([...reachable.values()].map((ref) => ref.filePath)),
    ]);
    project.resolveSourceFileDependencies();
    const languageService = project.getLanguageService().compilerObject;

    const internalToFinal = new Map<string, string>();
    const internalNames = new Map<string, string>();
    const sources = new Map<string, DeclarationRef>();
    const locations = new Map<string, string>();
    const edits = new Map<
      string,
      { start: number; length: number; text: string }[]
    >();
    let counter = 0;
    for (const { ref, name } of plan.declarations.values()) {
      const nameNode = findDeclarationNameNode(project, ref);
      if (!nameNode) continue;
      const internalName = `${ref.name}__oapi${counter++}`;
      const renameLocations =
        languageService.findRenameLocations(
          nameNode.getSourceFile().getFilePath(),
          nameNode.getStart(),
          false,
          false,
          { providePrefixAndSuffixTextForRename: false },
        ) ?? [];
      for (const location of renameLocations) {
        const fileEdits = edits.get(location.fileName) ?? [];
        fileEdits.push({
          start: location.textSpan.start,
          length: location.textSpan.length,
          text: internalName,
        });
        edits.set(location.fileName, fileEdits);
      }
      internalToFinal.set(internalName, name);
      internalNames.set(declarationKey(ref), internalName);
      locations.set(internalName, ref.filePath);
      sources.set(name, ref);
    }

    const overlay = new Map<string, string>();
    for (const [fileName, fileEdits] of edits) {
      const original = project.getSourceFile(fileName)?.getFullText();
      if (original === undefined) continue;
      const seen = new Set<number>();
      const text = [...fileEdits]
        .filter((edit) => !seen.has(edit.start) && seen.add(edit.start))
        .sort((a, b) => b.start - a.start)
        .reduce(
          (result, edit) =>
            `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.start + edit.length)}`,
          original,
        );
      overlay.set(fileName, text);
    }

    // Schemas referencing a renamed declaration live in the files the
    // renames touched; regenerate those so their references follow
    const forcedNames = new Set(internalToFinal.values());
    for (const ref of reachable.values()) {
      if (ref.generic) continue;
      if (plan.declarations.has(declarationKey(ref))) continue;
      if (!overlay.has(ref.filePath)) continue;
      locations.set(ref.name, ref.filePath);
      forcedNames.add(ref.name);
      sources.set(ref.name, ref);
    }

    const generated = yield* generateNamedSchemas(locations, tsconfig, overlay);

    // Generic instantiations the operations use directly (`Page<AddressDto>`)
    // whose arguments were renamed: generate them over the renamed sources
    const generics = collectRenamedGenerics(
      methods,
      plan,
      internalNames,
      reachable,
    );
    if (generics.length > 0) {
      const virtualPath = join(
        dirname(tsconfig),
        '.openapi.collision-generics.ts',
      );
      const imports = new Map<string, Set<string>>();
      for (const generic of generics) {
        for (const [name, filePath] of generic.imports) {
          imports.set(filePath, (imports.get(filePath) ?? new Set()).add(name));
        }
      }
      const content = [
        ...[...imports].map(
          ([filePath, names]) =>
            `import type { ${[...names].sort().join(', ')} } from '${toImportPath(virtualPath, filePath)}';`,
        ),
        ...generics.map(
          (generic, index) =>
            `export type __OapiGeneric${index} = ${generic.internalText};`,
        ),
      ].join('\n');
      const genericSchemas = yield* generateSchemasFromVirtualFile(
        virtualPath,
        content,
        tsconfig,
        overlay,
      );
      for (const [index, generic] of generics.entries()) {
        const aliasName = `__OapiGeneric${index}`;
        const schema =
          genericSchemas.definitions[generic.internalText] ??
          genericSchemas.definitions[aliasName];
        if (schema) generated.definitions[generic.internalText] = schema;
        forcedNames.add(generic.finalText);
      }
      for (const [name, schema] of Object.entries(genericSchemas.definitions)) {
        if (!name.startsWith('__OapiGeneric') && !generated.definitions[name]) {
          generated.definitions[name] = schema;
        }
      }
    }

    const definitions = renameInSchemas(generated.definitions, internalToFinal);

    const forced: Record<string, JsonSchema> = {};
    const extra: Record<string, JsonSchema> = {};
    for (const [name, schema] of Object.entries(definitions)) {
      if (forcedNames.has(name)) forced[name] = schema;
      else if (!/__oapi\d+/.test(name)) extra[name] = schema;
    }

    return {
      forced: { definitions: forced },
      extra: { definitions: extra },
      sources,
    } as RegeneratedSchemas;
  },
);

// Generic instantiations of a colliding declaration, or over one, are part
// of the collision: `FilterOption<X>`, `Page<AddressDto>`
export const collisionInlinedNames = (
  schemaNames: readonly string[],
  plan: SchemaNamePlan,
) => {
  const patterns = [...plan.inline].map((name) => identifierPattern(name));
  return new Set(
    schemaNames.filter((name) =>
      patterns.some((pattern) => pattern.test(name)),
    ),
  );
};
