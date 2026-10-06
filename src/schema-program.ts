// Building the program here, rather than letting ts-json-schema-generator
// load a tsconfig, allows restricting a run to some files, in-memory files
// and source edits, and reusing parsed library declarations across runs.
import { Effect, Either } from 'effect';
import { statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import type { Config as TsJsonSchemaConfig } from 'ts-json-schema-generator';
import type * as TypeScript from 'typescript';
import { SchemaGenerationError } from './errors.js';
import { MAPPED_TYPE_HELPERS } from './mapped-types.js';

const require = createRequire(import.meta.url);
const tsj =
  require('ts-json-schema-generator') as typeof import('ts-json-schema-generator');
// The generator inspects nodes with its own `typescript` instance, so the
// program must be built with the same one.
const ts = createRequire(require.resolve('ts-json-schema-generator'))(
  'typescript',
) as typeof TypeScript;

export type SchemaProgramOptions = {
  readonly tsconfig: string;
  readonly rootFiles: readonly string[];
  readonly virtualFiles?: ReadonlyMap<string, string>;
  readonly stripHeritageIn?: ReadonlySet<string>;
};

type TsJsonSchemaOutput = ReturnType<
  ReturnType<typeof tsj.createGenerator>['createSchema']
>;

type RootType = {
  readonly name: string;
  readonly filePath: string;
  readonly node: TypeScript.Node;
};

export type SchemaGeneratorHandle = {
  readonly createSchema: (type: string) => TsJsonSchemaOutput;
  readonly rootTypes: () => readonly RootType[];
  readonly findType: (
    filePath: string,
    name: string,
  ) => TypeScript.Node | undefined;
  readonly inlineExternalTypes: (
    filePath: string,
    name: string,
  ) => string | undefined;
  // A new generator per call, so one failure leaves nothing behind for the next
  readonly createSchemaForNodes: (
    nodes: readonly TypeScript.Node[],
  ) => TsJsonSchemaOutput;
};

const BASE_GENERATOR_CONFIG: TsJsonSchemaConfig = {
  skipTypeCheck: true,
  expose: 'export',
  jsDoc: 'extended',
  sortProps: true,
  strictTuples: false,
  encodeRefs: false,
  additionalProperties: false,
};

const compilerOptionsCache = new Map<string, TypeScript.CompilerOptions>();

const loadCompilerOptions = (tsconfig: string) => {
  const cached = compilerOptionsCache.get(tsconfig);
  if (cached) return Either.right(cached);

  const raw = ts.sys.readFile(tsconfig);
  if (raw === undefined) {
    return Either.left(
      new SchemaGenerationError({
        message: `Cannot read tsconfig "${tsconfig}"`,
      }),
    );
  }
  const parsed = ts.parseConfigFileTextToJson(tsconfig, raw);
  if (parsed.error) {
    return Either.left(
      new SchemaGenerationError({
        message: `${ts.flattenDiagnosticMessageText(parsed.error.messageText, '\n')} (tsconfig: ${tsconfig})`,
      }),
    );
  }
  const { options } = ts.parseJsonConfigFileContent(
    parsed.config,
    ts.sys,
    resolve(dirname(tsconfig)),
    {},
    tsconfig,
  );

  const compilerOptions: TypeScript.CompilerOptions = {
    ...options,
    noEmit: true,
    skipLibCheck: true,
    skipDefaultLibCheck: true,
  };
  for (const key of [
    'out',
    'outDir',
    'outFile',
    'declaration',
    'declarationDir',
    'declarationMap',
  ] as const) {
    delete compilerOptions[key];
  }

  compilerOptionsCache.set(tsconfig, compilerOptions);
  return Either.right(compilerOptions);
};

const hasModifier = (node: TypeScript.Node, kind: TypeScript.SyntaxKind) =>
  ts.canHaveModifiers(node) &&
  (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === kind);

// @nestjs/swagger names a schema after every class, exported or not; the
// generator only names exported ones
const exportInsertions = (sourceFile: TypeScript.SourceFile) =>
  sourceFile.statements.flatMap((statement) => {
    if (
      !ts.isClassDeclaration(statement) ||
      !statement.name ||
      hasModifier(statement, ts.SyntaxKind.ExportKeyword) ||
      hasModifier(statement, ts.SyntaxKind.DeclareKeyword)
    ) {
      return [];
    }
    // Before the first non-decorator modifier (`abstract`) or `class`
    const anchor =
      ts.getModifiers(statement)?.[0] ??
      statement
        .getChildren(sourceFile)
        .find((child) => child.kind === ts.SyntaxKind.ClassKeyword);
    return anchor ? [anchor.getStart(sourceFile)] : [];
  });

const isMappedTypeHeritage = (clause: TypeScript.HeritageClause) =>
  clause.token === ts.SyntaxKind.ExtendsKeyword &&
  clause.types.some((type) => {
    const expression = type.expression;
    if (!ts.isCallExpression(expression)) return false;
    const callee = expression.expression;
    if (ts.isIdentifier(callee)) return MAPPED_TYPE_HELPERS.has(callee.text);
    if (ts.isPropertyAccessExpression(callee))
      return MAPPED_TYPE_HELPERS.has(callee.name.text);
    return false;
  });

const mappedTypeHeritageRanges = (sourceFile: TypeScript.SourceFile) =>
  sourceFile.statements.flatMap((statement) =>
    ts.isClassDeclaration(statement)
      ? (statement.heritageClauses ?? [])
          .filter(isMappedTypeHeritage)
          .map((clause) => [clause.pos, clause.end] as const)
      : [],
  );

const heritageRanges = (sourceFile: TypeScript.SourceFile) => {
  const ranges: Array<readonly [number, number]> = [];
  const visit = (node: TypeScript.Node): void => {
    if (ts.isClassDeclaration(node) && node.heritageClauses) {
      for (const clause of node.heritageClauses) {
        ranges.push([clause.pos, clause.end]);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return ranges;
};

type Edit = {
  readonly start: number;
  readonly end: number;
  readonly text: string;
};

const applyEdits = (text: string, edits: readonly Edit[]) =>
  [...edits]
    .sort((a, b) => b.start - a.start)
    .reduce(
      (result, edit) =>
        `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`,
      text,
    );

const transformSource = (
  sourceFile: TypeScript.SourceFile,
  stripHeritage: boolean,
) => {
  const removedRanges = stripHeritage
    ? heritageRanges(sourceFile)
    : mappedTypeHeritageRanges(sourceFile);
  const edits: Edit[] = [
    ...exportInsertions(sourceFile).map((position) => ({
      start: position,
      end: position,
      text: 'export ',
    })),
    ...removedRanges.map(([start, end]) => ({ start, end, text: '' })),
  ];
  return edits.length > 0 ? applyEdits(sourceFile.text, edits) : undefined;
};

// Parsing library declarations dominates the cost of each program
const librarySourceCache = new Map<string, TypeScript.SourceFile>();

// Recovery builds programs that differ from the first by one edited file:
// only that file is parsed again, and TypeScript skips binding the rest
const projectSourceCache = new Map<string, TypeScript.SourceFile>();

export const clearSchemaProgramCache = () => {
  librarySourceCache.clear();
  projectSourceCache.clear();
  compilerOptionsCache.clear();
};

const hashText = (text: string) => {
  let hash = 5381;
  for (let index = 0; index < text.length; index++) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  }
  return `${text.length}:${hash >>> 0}`;
};

const isLibraryFile = (fileName: string) =>
  fileName.endsWith('.d.ts') || fileName.includes('/node_modules/');

const createCompilerHost = (
  compilerOptions: TypeScript.CompilerOptions,
  options: SchemaProgramOptions,
): TypeScript.CompilerHost => {
  const host = ts.createCompilerHost(compilerOptions, true);
  const virtualFiles = options.virtualFiles ?? new Map<string, string>();
  const stripHeritageIn = options.stripHeritageIn ?? new Set<string>();

  return {
    ...host,
    fileExists: (fileName) =>
      virtualFiles.has(resolve(fileName)) || host.fileExists(fileName),
    readFile: (fileName) =>
      virtualFiles.get(resolve(fileName)) ?? host.readFile(fileName),
    getSourceFile: (fileName, languageVersion, onError, shouldCreate) => {
      const absolute = resolve(fileName);
      const virtual = virtualFiles.get(absolute);
      const strip = stripHeritageIn.has(absolute);
      if (virtual !== undefined) {
        const key = `${absolute}|${JSON.stringify(languageVersion)}|${strip}|${hashText(virtual)}`;
        const cached = projectSourceCache.get(key);
        if (cached) return cached;
        const sourceFile = ts.createSourceFile(
          fileName,
          virtual,
          languageVersion,
          true,
        );
        const transformed = transformSource(sourceFile, strip);
        const result =
          transformed === undefined
            ? sourceFile
            : ts.createSourceFile(fileName, transformed, languageVersion, true);
        projectSourceCache.set(key, result);
        return result;
      }

      if (isLibraryFile(fileName)) {
        const key = `${fileName}|${JSON.stringify(languageVersion)}`;
        const cached = librarySourceCache.get(key);
        if (cached) return cached;
        const sourceFile = host.getSourceFile(
          fileName,
          languageVersion,
          onError,
          shouldCreate,
        );
        if (sourceFile) librarySourceCache.set(key, sourceFile);
        return sourceFile;
      }

      // Keyed by modification time and size: files can change between runs
      const stats = statSync(absolute, { throwIfNoEntry: false });
      const key = `${absolute}|${JSON.stringify(languageVersion)}|${strip}|${stats?.mtimeMs}:${stats?.size}`;
      const cached = projectSourceCache.get(key);
      if (cached) return cached;

      const sourceFile = host.getSourceFile(
        fileName,
        languageVersion,
        onError,
        shouldCreate,
      );
      if (!sourceFile) return sourceFile;

      const transformed = transformSource(sourceFile, strip);
      const result =
        transformed === undefined
          ? sourceFile
          : ts.createSourceFile(fileName, transformed, languageVersion, true);
      projectSourceCache.set(key, result);
      return result;
    },
  };
};

// Diagnostic positions refer to this text, not the file on disk
export const readProgramSource = (
  filePath: string,
  options: SchemaProgramOptions,
) => {
  const absolute = resolve(filePath);
  const text = options.virtualFiles?.get(absolute) ?? ts.sys.readFile(absolute);
  if (text === undefined) return undefined;
  const sourceFile = ts.createSourceFile(
    absolute,
    text,
    ts.ScriptTarget.Latest,
    true,
  );
  return (
    transformSource(
      sourceFile,
      options.stripHeritageIn?.has(absolute) ?? false,
    ) ?? text
  );
};

export const findPropertyTypePositions = (
  filePath: string,
  text: string,
  typeName: string,
) => {
  const sourceFile = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
  );
  const declaration = sourceFile.statements.find(
    (
      statement,
    ): statement is
      | TypeScript.ClassDeclaration
      | TypeScript.InterfaceDeclaration =>
      (ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement)) &&
      statement.name?.text === typeName,
  );
  if (!declaration) return [];
  return (declaration.members as TypeScript.NodeArray<TypeScript.Node>).flatMap(
    (member) =>
      (ts.isPropertyDeclaration(member) || ts.isPropertySignature(member)) &&
      member.type
        ? [member.type.getStart(sourceFile)]
        : [],
  );
};

export const eraseFailingPropertyType = (
  filePath: string,
  text: string,
  position: number,
) => {
  const sourceFile = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
  );
  let match:
    | TypeScript.PropertyDeclaration
    | TypeScript.PropertySignature
    | undefined;
  const visit = (node: TypeScript.Node): void => {
    if (position < node.getFullStart() || position > node.getEnd()) return;
    if (
      (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node)) &&
      node.type
    ) {
      match = node;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (!match?.type) return undefined;

  const start = match.type.getStart(sourceFile);
  return {
    text: `${text.slice(0, start)}unknown${text.slice(match.type.getEnd())}`,
    property: match.name.getText(sourceFile),
  };
};

const createSchemaProgram = (options: SchemaProgramOptions) =>
  Effect.flatMap(loadCompilerOptions(options.tsconfig), (compilerOptions) =>
    Effect.try({
      try: () =>
        ts.createProgram({
          rootNames: options.rootFiles.map((file) => resolve(file)),
          options: compilerOptions,
          host: createCompilerHost(compilerOptions, options),
        }),
      catch: (error) =>
        SchemaGenerationError.fromError(error, `tsconfig: ${options.tsconfig}`),
    }),
  );

export const createSchemaGenerator = (
  options: SchemaProgramOptions,
  overrides: Partial<TsJsonSchemaConfig> = {},
): Effect.Effect<SchemaGeneratorHandle, SchemaGenerationError> =>
  Effect.map(createSchemaProgram(options), (program) =>
    createSchemaGeneratorForProgram(program, overrides),
  );

const isSchemaType = (
  node: TypeScript.Node,
): node is
  | TypeScript.ClassDeclaration
  | TypeScript.InterfaceDeclaration
  | TypeScript.TypeAliasDeclaration
  | TypeScript.EnumDeclaration =>
  ts.isClassDeclaration(node) ||
  ts.isInterfaceDeclaration(node) ||
  ts.isTypeAliasDeclaration(node) ||
  ts.isEnumDeclaration(node);

// Explicit roots instead of the generator's own `'*'`, which also treats
// every function and arrow-function constant as a root; some of those crash
// it ("Invalid value used as weak map key"), losing the whole file
const collectRootTypes = (program: TypeScript.Program) => {
  const checker = program.getTypeChecker();
  const rootFiles = new Set(
    program.getRootFileNames().map((file) => resolve(file)),
  );
  const roots: TypeScript.Node[] = [];
  const seen = new Set<TypeScript.Node>();
  const add = (node: TypeScript.Node) => {
    if (seen.has(node)) return;
    seen.add(node);
    roots.push(node);
  };
  const isGeneric = (node: TypeScript.Node) =>
    !ts.isEnumDeclaration(node) &&
    ((node as TypeScript.ClassDeclaration).typeParameters?.length ?? 0) > 0;

  for (const sourceFile of program.getSourceFiles()) {
    if (!rootFiles.has(resolve(sourceFile.fileName))) continue;
    for (const statement of sourceFile.statements) {
      if (
        isSchemaType(statement) &&
        statement.name &&
        hasModifier(statement, ts.SyntaxKind.ExportKeyword) &&
        !isGeneric(statement)
      ) {
        add(statement);
      }
      // export { A, B } and export { A } from './a'
      if (
        ts.isExportDeclaration(statement) &&
        statement.exportClause &&
        ts.isNamedExports(statement.exportClause)
      ) {
        for (const element of statement.exportClause.elements) {
          const symbol = statement.moduleSpecifier
            ? checker.getExportSpecifierLocalTargetSymbol(element)
            : checker.getSymbolAtLocation(element.name);
          const target =
            symbol && symbol.flags & ts.SymbolFlags.Alias
              ? checker.getAliasedSymbol(symbol)
              : symbol;
          for (const declaration of target?.declarations ?? []) {
            if (isSchemaType(declaration) && !isGeneric(declaration))
              add(declaration);
          }
        }
      }
    }
  }
  return roots;
};

const MAX_INLINE_DEPTH = 3;

// The generator cannot index some library typings built from mapped types,
// but the checker resolves them: references to them are replaced with the
// structure the checker resolves
const inlineExternalTypes = (
  program: TypeScript.Program,
  declaration: TypeScript.Node,
) => {
  const checker = program.getTypeChecker();
  const sourceFile = declaration.getSourceFile();

  const isExternal = (type: TypeScript.Type) => {
    const declarations =
      (type.aliasSymbol ?? type.getSymbol())?.declarations ?? [];
    return (
      (type.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection)) !== 0 &&
      !checker.isArrayType(type) &&
      declarations.length > 0 &&
      declarations.every((node) => {
        const file = node.getSourceFile();
        return (
          file.isDeclarationFile && !program.isSourceFileDefaultLibrary(file)
        );
      })
    );
  };

  const typeText = (type: TypeScript.Type, depth: number): string => {
    if (type.isUnion() && type.types.some(isExternal)) {
      return type.types.map((member) => typeText(member, depth)).join(' | ');
    }
    if (!isExternal(type)) {
      return checker.typeToString(
        type,
        declaration,
        ts.TypeFormatFlags.NoTruncation,
      );
    }
    if (depth >= MAX_INLINE_DEPTH) return 'unknown';
    const members = checker.getPropertiesOfType(type).map((property) => {
      const optional = (property.flags & ts.SymbolFlags.Optional) !== 0;
      const propertyType = checker.getTypeOfSymbolAtLocation(
        property,
        declaration,
      );
      const text = typeText(
        optional ? checker.getNonNullableType(propertyType) : propertyType,
        depth + 1,
      );
      return `${JSON.stringify(property.name)}${optional ? '?' : ''}: ${text}`;
    });
    const index = checker.getIndexInfoOfType(type, ts.IndexKind.String);
    if (index)
      members.push(`[key: string]: ${typeText(index.type, depth + 1)}`);
    return `{ ${members.join('; ')} }`;
  };

  const edits: Edit[] = [];
  const visit = (node: TypeScript.Node): void => {
    if (ts.isTypeReferenceNode(node)) {
      const type = checker.getTypeAtLocation(node);
      if (isExternal(type)) {
        edits.push({
          start: node.getStart(sourceFile),
          end: node.getEnd(),
          text: typeText(type, 0),
        });
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(declaration);
  return edits.length > 0 ? applyEdits(sourceFile.text, edits) : undefined;
};

export const createSchemaGeneratorForProgram = (
  program: TypeScript.Program,
  overrides: Partial<TsJsonSchemaConfig> = {},
): SchemaGeneratorHandle => {
  const config = {
    ...tsj.DEFAULT_CONFIG,
    ...BASE_GENERATOR_CONFIG,
    ...overrides,
  };
  const newGenerator = () =>
    new tsj.SchemaGenerator(
      program,
      tsj.createParser(program, config),
      tsj.createFormatter(config),
      config,
    );
  const generator = newGenerator();

  const findType = (filePath: string, name: string) => {
    const sourceFile = program.getSourceFile(resolve(filePath));
    return sourceFile?.statements.find(
      (statement) => isSchemaType(statement) && statement.name?.text === name,
    );
  };

  return {
    createSchema: (type) =>
      type === '*'
        ? generator.createSchemaFromNodes(collectRootTypes(program))
        : generator.createSchema(type),
    rootTypes: () =>
      collectRootTypes(program).map((node) => ({
        name: (node as TypeScript.ClassDeclaration).name?.text ?? '',
        filePath: resolve(node.getSourceFile().fileName),
        node,
      })),
    findType,
    inlineExternalTypes: (filePath, name) => {
      const declaration = findType(filePath, name);
      return declaration && inlineExternalTypes(program, declaration);
    },
    createSchemaForNodes: (nodes) =>
      newGenerator().createSchemaFromNodes([...nodes]),
  };
};
