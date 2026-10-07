import { Node, ts, type CallExpression, type Expression } from 'ts-morph';
import {
  getCalleeName,
  getReturnedExpression,
  resolveDeclarations,
} from './ast.js';

type Primitive = string | number | boolean | null | undefined;

export type StaticValue =
  | { readonly kind: 'literal'; readonly value: Primitive }
  | { readonly kind: 'array'; readonly items: readonly StaticValue[] }
  | {
      readonly kind: 'object';
      readonly properties: Readonly<Record<string, StaticValue>>;
    }
  | { readonly kind: 'reference'; readonly name: string; readonly node?: Node }
  | { readonly kind: 'thunk'; readonly value: StaticValue }
  | { readonly kind: 'schemaRef'; readonly name: string; readonly node?: Node }
  | { readonly kind: 'unknown'; readonly text: string; readonly node?: Node };

export type StaticEnvironment = ReadonlyMap<string, () => StaticValue>;

export const EMPTY_ENVIRONMENT: StaticEnvironment = new Map();

const MAX_DEPTH = 20;

export const literal = (value: Primitive): StaticValue => ({
  kind: 'literal',
  value,
});

const UNDEFINED = literal(undefined);

const unknownValue = (node: Node): StaticValue => ({
  kind: 'unknown',
  text: node.getText(),
  node,
});

const propertyNameText = (name: Node) => {
  if (Node.isIdentifier(name) || Node.isPrivateIdentifier(name)) {
    return name.getText();
  }
  if (Node.isStringLiteral(name) || Node.isNumericLiteral(name)) {
    return String(name.getLiteralValue());
  }
  if (Node.isNoSubstitutionTemplateLiteral(name)) return name.getLiteralValue();
  return undefined;
};

const evaluateObjectLiteral = (
  node: Node,
  environment: StaticEnvironment,
  depth: number,
): StaticValue => {
  const properties: Record<string, StaticValue> = {};
  for (const property of node
    .asKindOrThrow(ts.SyntaxKind.ObjectLiteralExpression)
    .getProperties()) {
    if (Node.isPropertyAssignment(property)) {
      const name = propertyNameText(property.getNameNode());
      const initializer = property.getInitializer();
      if (name !== undefined && initializer) {
        properties[name] = evaluate(initializer, environment, depth + 1);
      }
      continue;
    }
    if (Node.isShorthandPropertyAssignment(property)) {
      properties[property.getName()] = evaluate(
        property.getNameNode(),
        environment,
        depth + 1,
      );
      continue;
    }
    if (Node.isSpreadAssignment(property)) {
      const spread = evaluate(property.getExpression(), environment, depth + 1);
      if (spread.kind === 'object')
        Object.assign(properties, spread.properties);
    }
  }
  return { kind: 'object', properties };
};

const evaluateArrayLiteral = (
  node: Node,
  environment: StaticEnvironment,
  depth: number,
): StaticValue => ({
  kind: 'array',
  items: node
    .asKindOrThrow(ts.SyntaxKind.ArrayLiteralExpression)
    .getElements()
    .flatMap((element) => {
      if (!Node.isSpreadElement(element)) {
        return [evaluate(element, environment, depth + 1)];
      }
      const spread = evaluate(element.getExpression(), environment, depth + 1);
      return spread.kind === 'array' ? spread.items : [];
    }),
});

const evaluateEnumMember = (member: Node, depth: number) => {
  if (!Node.isEnumMember(member)) return undefined;
  const value = member.getValue();
  if (value !== undefined) return literal(value);
  const initializer = member.getInitializer();
  if (!initializer) return undefined;
  return evaluate(initializer, EMPTY_ENVIRONMENT, depth + 1);
};

const evaluateIdentifier = (
  node: Node,
  environment: StaticEnvironment,
  depth: number,
): StaticValue => {
  const name = node.getText();
  const bound = environment.get(name);
  if (bound) return bound();
  if (name === 'undefined') return UNDEFINED;

  for (const declaration of resolveDeclarations(node)) {
    if (
      !Node.isVariableDeclaration(declaration) ||
      declaration.getVariableStatement()?.getDeclarationKind() !== 'const'
    ) {
      continue;
    }
    const initializer = declaration.getInitializer();
    if (!initializer) continue;
    const value = evaluate(initializer, EMPTY_ENVIRONMENT, depth + 1);
    if (value.kind !== 'unknown') return value;
  }

  return { kind: 'reference', name, node };
};

const evaluatePropertyAccess = (
  node: Node,
  environment: StaticEnvironment,
  depth: number,
): StaticValue => {
  const access = node.asKindOrThrow(ts.SyntaxKind.PropertyAccessExpression);

  for (const declaration of resolveDeclarations(access)) {
    const value = evaluateEnumMember(declaration, depth);
    if (value) return value;
  }

  const target = evaluate(access.getExpression(), environment, depth + 1);
  if (target.kind === 'object') {
    return target.properties[access.getName()] ?? UNDEFINED;
  }

  // `Dtos.UserDto` keeps the member name, which is the schema name
  return { kind: 'reference', name: access.getName(), node };
};

const evaluateFunction = (
  node: Node,
  environment: StaticEnvironment,
  depth: number,
): StaticValue => {
  const returned = getReturnedExpression(node);
  if (!returned) return unknownValue(node);
  return { kind: 'thunk', value: evaluate(returned, environment, depth + 1) };
};

const evaluateSchemaPath = (
  call: CallExpression,
  environment: StaticEnvironment,
  depth: number,
): StaticValue | undefined => {
  const [argument] = call.getArguments();
  if (!argument) return undefined;
  const value = unwrapThunk(evaluate(argument, environment, depth + 1));
  if (value?.kind === 'reference') {
    return { kind: 'schemaRef', name: value.name, node: value.node };
  }
  if (value?.kind === 'literal' && typeof value.value === 'string') {
    return { kind: 'schemaRef', name: value.value };
  }
  return undefined;
};

const enumRuntimeObject = (node: Node | undefined) => {
  if (!node) return undefined;
  const enumDeclaration = resolveDeclarations(node).find(
    Node.isEnumDeclaration,
  );
  if (!enumDeclaration) return undefined;
  const runtime: Record<string, unknown> = {};
  for (const member of enumDeclaration.getMembers()) {
    const value = member.getValue();
    if (value === undefined) return undefined;
    runtime[member.getName()] = value;
    // TypeScript emits a reverse mapping for numeric members, and
    // Object.values() returns those names too
    if (typeof value === 'number') runtime[value] = member.getName();
  }
  return runtime;
};

const NOT_STATIC = Symbol('notStatic');

const containsNotStatic = (value: unknown): boolean => {
  if (value === NOT_STATIC) return true;
  if (Array.isArray(value)) return value.some(containsNotStatic);
  if (value === null || typeof value !== 'object') return false;
  return Object.values(value).some(containsNotStatic);
};

const toPlainObject = (value: StaticValue) => {
  if (value.kind === 'reference') return enumRuntimeObject(value.node);
  const plain = toPlain(value, () => NOT_STATIC);
  if (containsNotStatic(plain) || plain === null || typeof plain !== 'object') {
    return undefined;
  }
  return plain;
};

const fromPlain = (value: unknown): StaticValue => {
  if (Array.isArray(value))
    return { kind: 'array', items: value.map(fromPlain) };
  if (value === null || typeof value !== 'object') {
    return literal(value as Primitive);
  }
  return {
    kind: 'object',
    properties: Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, fromPlain(item)]),
    ),
  };
};

const toCallback = (
  callback: Node | undefined,
  environment: StaticEnvironment,
  depth: number,
) => {
  if (!callback) return undefined;
  const returned = getReturnedExpression(callback);
  if (!returned) return undefined;
  const [itemParameter, indexParameter] = (
    callback as Node & { getParameters(): Node[] }
  ).getParameters();
  const itemName =
    itemParameter &&
    (itemParameter as Node & { getNameNode(): Node }).getNameNode();
  if (!itemName || !Node.isIdentifier(itemName)) return undefined;
  const indexName =
    indexParameter &&
    (indexParameter as Node & { getNameNode(): Node }).getNameNode();

  return (item: StaticValue, index: number) => {
    const bindings = new Map(environment);
    bindings.set(itemName.getText(), () => item);
    if (indexName && Node.isIdentifier(indexName)) {
      bindings.set(indexName.getText(), () => literal(index));
    }
    return evaluate(returned, bindings, depth + 1);
  };
};

const evaluateObjectMethod = (
  method: string,
  args: readonly Node[],
  environment: StaticEnvironment,
  depth: number,
): StaticValue | undefined => {
  const [argument] = args;
  if (!argument) return undefined;
  const value = evaluate(argument, environment, depth + 1);
  const object = toPlainObject(value);
  if (!object) return undefined;
  switch (method) {
    case 'values':
      return fromPlain(Object.values(object));
    case 'keys':
      return fromPlain(Object.keys(object));
    case 'entries':
      return fromPlain(Object.entries(object));
    case 'freeze':
      return value.kind === 'reference' ? fromPlain(object) : value;
    default:
      return undefined;
  }
};

const evaluateArrayMethod = (
  items: readonly StaticValue[],
  method: string,
  args: readonly Node[],
  environment: StaticEnvironment,
  depth: number,
): StaticValue | undefined => {
  switch (method) {
    case 'filter': {
      const predicate = toCallback(args[0], environment, depth);
      if (!predicate) return undefined;
      const kept: StaticValue[] = [];
      for (const [index, item] of items.entries()) {
        const keep = predicate(item, index);
        if (keep.kind !== 'literal') return undefined;
        if (keep.value) kept.push(item);
      }
      return { kind: 'array', items: kept };
    }
    case 'map': {
      const mapper = toCallback(args[0], environment, depth);
      if (!mapper) return undefined;
      const mapped = items.map(mapper);
      if (mapped.some((item) => item.kind === 'unknown')) return undefined;
      return { kind: 'array', items: mapped };
    }
    case 'concat': {
      const concatenated = [...items];
      for (const arg of args) {
        const value = evaluate(arg, environment, depth + 1);
        if (value.kind === 'array') concatenated.push(...value.items);
        else if (value.kind === 'literal') concatenated.push(value);
        else return undefined;
      }
      return { kind: 'array', items: concatenated };
    }
    case 'slice': {
      const bounds: number[] = [];
      for (const arg of args) {
        const bound = evaluate(arg, environment, depth + 1);
        if (bound.kind !== 'literal' || typeof bound.value !== 'number') {
          return undefined;
        }
        bounds.push(bound.value);
      }
      return { kind: 'array', items: items.slice(...bounds) };
    }
    case 'includes': {
      const [needleNode] = args;
      if (!needleNode) return undefined;
      const needle = evaluate(needleNode, environment, depth + 1);
      if (needle.kind !== 'literal') return undefined;
      return literal(
        items.some(
          (item) => item.kind === 'literal' && item.value === needle.value,
        ),
      );
    }
    default:
      return undefined;
  }
};

const evaluateCall = (
  node: Node,
  environment: StaticEnvironment,
  depth: number,
): StaticValue => {
  const call = node.asKindOrThrow(ts.SyntaxKind.CallExpression);
  const callee = call.getExpression();
  const args = call.getArguments();

  if (getCalleeName(callee) === 'getSchemaPath') {
    return evaluateSchemaPath(call, environment, depth) ?? unknownValue(node);
  }
  if (!Node.isPropertyAccessExpression(callee)) return unknownValue(node);

  const method = callee.getName();
  if (callee.getExpression().getText() === 'Object') {
    return (
      evaluateObjectMethod(method, args, environment, depth) ??
      unknownValue(node)
    );
  }

  const target = evaluate(callee.getExpression(), environment, depth + 1);
  if (target.kind !== 'array') return unknownValue(node);
  return (
    evaluateArrayMethod(target.items, method, args, environment, depth) ??
    unknownValue(node)
  );
};

const evaluateNew = (
  node: Node,
  environment: StaticEnvironment,
  depth: number,
): StaticValue => {
  const expression = node.asKindOrThrow(ts.SyntaxKind.NewExpression);
  const [argument] = expression.getArguments();
  if (expression.getExpression().getText() !== 'Set' || !argument) {
    return unknownValue(node);
  }
  const value = evaluate(argument, environment, depth + 1);
  if (value.kind !== 'array') return unknownValue(node);
  const seen = new Set<unknown>();
  return {
    kind: 'array',
    items: value.items.filter((item) => {
      if (item.kind !== 'literal') return true;
      if (seen.has(item.value)) return false;
      seen.add(item.value);
      return true;
    }),
  };
};

const evaluatePrefixUnary = (
  node: Node,
  environment: StaticEnvironment,
  depth: number,
): StaticValue => {
  const unary = node.asKindOrThrow(ts.SyntaxKind.PrefixUnaryExpression);
  const operand = evaluate(unary.getOperand(), environment, depth + 1);
  if (operand.kind !== 'literal') return unknownValue(node);

  switch (unary.getOperatorToken()) {
    case ts.SyntaxKind.MinusToken:
      if (typeof operand.value !== 'number') return unknownValue(node);
      return literal(-operand.value);
    case ts.SyntaxKind.PlusToken:
      if (typeof operand.value !== 'number') return unknownValue(node);
      return operand;
    case ts.SyntaxKind.ExclamationToken:
      return literal(!operand.value);
    default:
      return unknownValue(node);
  }
};

const isConcatenable = (value: Primitive): value is string | number =>
  typeof value === 'string' || typeof value === 'number';

const evaluateBinary = (
  node: Node,
  environment: StaticEnvironment,
  depth: number,
): StaticValue => {
  const binary = node.asKindOrThrow(ts.SyntaxKind.BinaryExpression);
  const operator = binary.getOperatorToken().getKind();
  const left = evaluate(binary.getLeft(), environment, depth + 1);
  const right = evaluate(binary.getRight(), environment, depth + 1);

  if (operator === ts.SyntaxKind.QuestionQuestionToken) {
    return left.kind === 'literal' && left.value == null ? right : left;
  }
  if (operator === ts.SyntaxKind.BarBarToken && left.kind === 'literal') {
    return left.value ? left : right;
  }
  if (
    operator === ts.SyntaxKind.AmpersandAmpersandToken &&
    left.kind === 'literal'
  ) {
    return left.value ? right : left;
  }
  if (left.kind !== 'literal' || right.kind !== 'literal') {
    return unknownValue(node);
  }

  const [a, b] = [left.value, right.value];
  switch (operator) {
    case ts.SyntaxKind.EqualsEqualsEqualsToken:
      return literal(a === b);
    case ts.SyntaxKind.ExclamationEqualsEqualsToken:
      return literal(a !== b);
    case ts.SyntaxKind.EqualsEqualsToken:
      return literal(a == b);
    case ts.SyntaxKind.ExclamationEqualsToken:
      return literal(a != b);
    case ts.SyntaxKind.LessThanToken:
      return literal((a as number) < (b as number));
    case ts.SyntaxKind.GreaterThanToken:
      return literal((a as number) > (b as number));
    case ts.SyntaxKind.PlusToken:
      if (typeof a === 'number' && typeof b === 'number') return literal(a + b);
      if (isConcatenable(a) && isConcatenable(b)) return literal(`${a}${b}`);
      return unknownValue(node);
    case ts.SyntaxKind.MinusToken:
      if (typeof a !== 'number' || typeof b !== 'number')
        return unknownValue(node);
      return literal(a - b);
    case ts.SyntaxKind.AsteriskToken:
      if (typeof a !== 'number' || typeof b !== 'number')
        return unknownValue(node);
      return literal(a * b);
    case ts.SyntaxKind.SlashToken:
      if (typeof a !== 'number' || typeof b !== 'number')
        return unknownValue(node);
      return literal(a / b);
    default:
      return unknownValue(node);
  }
};

const evaluateTemplate = (
  node: Node,
  environment: StaticEnvironment,
  depth: number,
): StaticValue => {
  const template = node.asKindOrThrow(ts.SyntaxKind.TemplateExpression);
  let text = template.getHead().getLiteralText();
  for (const span of template.getTemplateSpans()) {
    const value = evaluate(span.getExpression(), environment, depth + 1);
    if (
      value.kind !== 'literal' ||
      (!isConcatenable(value.value) && typeof value.value !== 'boolean')
    ) {
      return unknownValue(node);
    }
    text += `${value.value}${span.getLiteral().getLiteralText()}`;
  }
  return literal(text);
};

export const evaluate = (
  node: Node,
  environment: StaticEnvironment = EMPTY_ENVIRONMENT,
  depth = 0,
): StaticValue => {
  if (depth > MAX_DEPTH) return unknownValue(node);

  switch (node.getKind()) {
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
      return literal(
        (node as Node & { getLiteralValue(): string }).getLiteralValue(),
      );
    case ts.SyntaxKind.NumericLiteral:
      return literal(
        node.asKindOrThrow(ts.SyntaxKind.NumericLiteral).getLiteralValue(),
      );
    case ts.SyntaxKind.TrueKeyword:
      return literal(true);
    case ts.SyntaxKind.FalseKeyword:
      return literal(false);
    case ts.SyntaxKind.NullKeyword:
      return literal(null);
    case ts.SyntaxKind.RegularExpressionLiteral:
      return literal(node.getText());
    case ts.SyntaxKind.ObjectLiteralExpression:
      return evaluateObjectLiteral(node, environment, depth);
    case ts.SyntaxKind.ArrayLiteralExpression:
      return evaluateArrayLiteral(node, environment, depth);
    case ts.SyntaxKind.Identifier:
      return evaluateIdentifier(node, environment, depth);
    case ts.SyntaxKind.PropertyAccessExpression:
      return evaluatePropertyAccess(node, environment, depth);
    case ts.SyntaxKind.ArrowFunction:
    case ts.SyntaxKind.FunctionExpression:
      return evaluateFunction(node, environment, depth);
    case ts.SyntaxKind.CallExpression:
      return evaluateCall(node, environment, depth);
    case ts.SyntaxKind.PrefixUnaryExpression:
      return evaluatePrefixUnary(node, environment, depth);
    case ts.SyntaxKind.BinaryExpression:
      return evaluateBinary(node, environment, depth);
    case ts.SyntaxKind.TemplateExpression:
      return evaluateTemplate(node, environment, depth);
    case ts.SyntaxKind.NewExpression:
      return evaluateNew(node, environment, depth);
    case ts.SyntaxKind.ParenthesizedExpression:
    case ts.SyntaxKind.AsExpression:
    case ts.SyntaxKind.SatisfiesExpression:
    case ts.SyntaxKind.NonNullExpression:
    case ts.SyntaxKind.TypeAssertionExpression:
      return evaluate(
        (node as Node & { getExpression(): Expression }).getExpression(),
        environment,
        depth + 1,
      );
    default:
      return unknownValue(node);
  }
};

export const getProperty = (value: StaticValue | undefined, key: string) =>
  value?.kind === 'object' ? value.properties[key] : undefined;

export const asString = (value: StaticValue | undefined) =>
  value?.kind === 'literal' && typeof value.value === 'string'
    ? value.value
    : undefined;

export const asStrings = (values: readonly StaticValue[]) =>
  values.flatMap((value) => {
    const text = asString(value);
    return text === undefined ? [] : [text];
  });

export const asNumber = (value: StaticValue | undefined) =>
  value?.kind === 'literal' && typeof value.value === 'number'
    ? value.value
    : undefined;

export const asBoolean = (value: StaticValue | undefined) =>
  value?.kind === 'literal' && typeof value.value === 'boolean'
    ? value.value
    : undefined;

export const unwrapThunk = (
  value: StaticValue | undefined,
): StaticValue | undefined =>
  value?.kind === 'thunk' ? unwrapThunk(value.value) : value;

export const schemaRefPath = (name: string) => `#/components/schemas/${name}`;

const renderSchemaRef = (value: StaticValue): unknown =>
  value.kind === 'schemaRef' ? schemaRefPath(value.name) : undefined;

export const toPlain = (
  value: StaticValue,
  onOpaque: (value: StaticValue) => unknown = renderSchemaRef,
): unknown => {
  switch (value.kind) {
    case 'literal':
      return value.value;
    case 'array':
      return value.items
        .map((item) => toPlain(item, onOpaque))
        .filter((item) => item !== undefined);
    case 'object':
      return Object.fromEntries(
        Object.entries(value.properties).flatMap(([key, item]) => {
          const plain = toPlain(item, onOpaque);
          return plain === undefined ? [] : [[key, plain]];
        }),
      );
    default:
      return onOpaque(value);
  }
};
