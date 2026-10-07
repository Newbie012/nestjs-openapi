import {
  Node,
  type MethodDeclaration,
  type SourceFile,
  type Type,
} from 'ts-morph';
import {
  getAwaitedReturnType,
  isUserCode,
  resolveDeclarations,
} from './ast.js';
import {
  getEffectiveDecorators,
  type DecoratorCall,
  type DecoratorExpansionOptions,
} from './decorators.js';
import type { DeclarationRef } from '../model/domain.js';
import { unwrapThunk, type StaticValue } from './static-value.js';

export const declarationKey = (
  ref: Pick<DeclarationRef, 'filePath' | 'name'>,
) => `${ref.filePath}::${ref.name}`;

type SchemaDeclaration = Node & {
  getName(): string | undefined;
  isExported(): boolean;
};

const toSchemaDeclaration = (
  node: Node,
): { node: SchemaDeclaration; kind: DeclarationRef['kind'] } | undefined => {
  if (Node.isClassDeclaration(node)) return { node, kind: 'class' };
  if (Node.isInterfaceDeclaration(node)) return { node, kind: 'interface' };
  if (Node.isEnumDeclaration(node)) return { node, kind: 'enum' };
  if (Node.isTypeAliasDeclaration(node)) return { node, kind: 'type' };
  if (Node.isEnumMember(node)) return { node: node.getParent(), kind: 'enum' };
  return undefined;
};

const hasTypeParameters = (node: Node) =>
  (Node.isClassDeclaration(node) ||
    Node.isInterfaceDeclaration(node) ||
    Node.isTypeAliasDeclaration(node)) &&
  node.getTypeParameters().length > 0;

type WalkState = {
  readonly found: Map<string, DeclarationRef>;
  readonly visitedTypes: Set<Type>;
  readonly visitedNodes: Set<Node>;
  readonly importAliases: ReadonlyMap<Node, readonly string[]>;
  readonly expansion: DecoratorExpansionOptions | undefined;
};

const collectImportAliases = (sourceFile: SourceFile) => {
  const aliases = new Map<Node, string[]>();
  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    for (const namedImport of importDeclaration.getNamedImports()) {
      const alias = namedImport.getAliasNode()?.getText();
      if (!alias) continue;
      for (const declaration of resolveDeclarations(
        namedImport.getNameNode(),
      )) {
        aliases.set(declaration, [...(aliases.get(declaration) ?? []), alias]);
      }
    }
  }
  return aliases;
};

const recordDeclaration = (node: Node, state: WalkState, topLevel: boolean) => {
  const declaration = toSchemaDeclaration(node);
  if (!declaration || !isUserCode(declaration.node)) return;

  const name = declaration.node.getName();
  if (!name) return;

  const localNames = topLevel
    ? state.importAliases.get(declaration.node)
    : undefined;
  const ref: DeclarationRef = {
    name,
    filePath: declaration.node.getSourceFile().getFilePath(),
    exported: declaration.node.isExported(),
    kind: declaration.kind,
    topLevel,
    ...(localNames ? { localNames } : {}),
    ...(hasTypeParameters(declaration.node) ? { generic: true } : {}),
  };
  const key = declarationKey(ref);
  const existing = state.found.get(key);
  if (!existing || (topLevel && !existing.topLevel)) state.found.set(key, ref);

  if (state.visitedNodes.has(declaration.node)) return;
  state.visitedNodes.add(declaration.node);
  walkDeclarationMembers(declaration.node, state);
};

const PROPERTY_DECORATORS = new Set(['ApiProperty', 'ApiPropertyOptional']);

const walkDeclarationMembers = (node: Node, state: WalkState) => {
  if (Node.isTypeAliasDeclaration(node)) {
    walkType(node.getType(), state, false);
    return;
  }
  if (!Node.isClassDeclaration(node) && !Node.isInterfaceDeclaration(node)) {
    return;
  }

  // Mapped-type bases, `extends PartialType(OmitType(UserDto, ['id']))`,
  // are not in the class type's properties
  const heritage = Node.isClassDeclaration(node)
    ? node.getExtends()?.getExpression()
    : undefined;
  if (heritage && Node.isCallExpression(heritage)) {
    heritage.forEachDescendant((descendant) => {
      if (!Node.isIdentifier(descendant)) return;
      for (const declaration of resolveDeclarations(descendant)) {
        if (Node.isClassDeclaration(declaration)) {
          recordDeclaration(declaration, state, false);
        }
      }
    });
  }

  for (const property of node.getType().getProperties()) {
    const declaration =
      property.getValueDeclaration() ?? property.getDeclarations()[0];
    if (!declaration) continue;
    walkType(declaration.getType(), state, false);
    if (!Node.isPropertyDeclaration(declaration)) continue;
    for (const call of getEffectiveDecorators(declaration, state.expansion)) {
      if (PROPERTY_DECORATORS.has(call.name)) {
        walkReference(call.args[0], state, false);
      }
    }
  }
};

const walkType = (type: Type, state: WalkState, topLevel: boolean) => {
  if (state.visitedTypes.has(type) && !topLevel) return;
  state.visitedTypes.add(type);

  if (type.isUnion()) {
    for (const member of type.getUnionTypes())
      walkType(member, state, topLevel);
    return;
  }
  if (type.isIntersection()) {
    for (const member of type.getIntersectionTypes()) {
      walkType(member, state, topLevel);
    }
    return;
  }

  const arrayElement = type.getArrayElementType();
  if (arrayElement) {
    walkType(arrayElement, state, topLevel);
    return;
  }

  for (const argument of [
    ...type.getTypeArguments(),
    ...type.getAliasTypeArguments(),
  ]) {
    walkType(argument, state, topLevel);
  }

  const symbol = type.getAliasSymbol() ?? type.getSymbol();
  if (!symbol) return;
  const aliased = symbol.isAlias() ? symbol.getAliasedSymbol() : undefined;
  for (const declaration of (aliased ?? symbol).getDeclarations()) {
    recordDeclaration(declaration, state, topLevel);
  }
};

const walkReference = (
  value: StaticValue | undefined,
  state: WalkState,
  topLevel: boolean,
) => {
  const unwrapped = unwrapThunk(value);
  if (!unwrapped) return;
  if (unwrapped.kind === 'array') {
    for (const item of unwrapped.items) walkReference(item, state, topLevel);
    return;
  }
  if (unwrapped.kind === 'object') {
    for (const item of Object.values(unwrapped.properties)) {
      walkReference(item, state, topLevel);
    }
    return;
  }
  if (unwrapped.kind !== 'reference' && unwrapped.kind !== 'schemaRef') return;
  if (!unwrapped.node) return;
  for (const declaration of resolveDeclarations(unwrapped.node)) {
    recordDeclaration(declaration, state, topLevel);
  }
};

const TYPE_BEARING_DECORATORS = /^Api(\w*Response|Body|Query|Param|Header)$/;

export const collectReferencedDeclarations = (
  method: MethodDeclaration,
  decoratorCalls: readonly DecoratorCall[],
  expansion?: DecoratorExpansionOptions,
) => {
  const state: WalkState = {
    found: new Map(),
    visitedTypes: new Set(),
    visitedNodes: new Set(),
    importAliases: collectImportAliases(method.getSourceFile()),
    expansion,
  };

  walkType(getAwaitedReturnType(method), state, true);

  for (const parameter of method.getParameters()) {
    if (parameter.getDecorators().length > 0) {
      walkType(parameter.getType(), state, true);
    }
  }

  for (const call of decoratorCalls) {
    if (TYPE_BEARING_DECORATORS.test(call.name)) {
      walkReference(call.args[0], state, true);
      continue;
    }
    if (call.name === 'ApiExtraModels') {
      for (const arg of call.args) walkReference(arg, state, true);
    }
  }

  return [...state.found.values()];
};
