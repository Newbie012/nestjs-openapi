import { Node, type Decorator } from 'ts-morph';
import {
  getCalleeName,
  getReturnedExpression,
  isUserCode,
  resolveDeclarations,
} from './ast.js';
import {
  EMPTY_ENVIRONMENT,
  evaluate,
  literal,
  type StaticEnvironment,
  type StaticValue,
} from './static-value.js';

export type DecoratorCall = {
  readonly name: string;
  readonly args: readonly StaticValue[];
  /** Custom decorators this call was expanded from, outermost first */
  readonly via: readonly string[];
  readonly node: Node;
};

export class TypeRef {
  constructor(
    readonly name: string,
    readonly node?: Node,
  ) {}
}

export const typeRef = (name: string) => new TypeRef(name);

export type DecoratorSpec = {
  readonly name: string;
  readonly args?: readonly unknown[];
};

export type CustomDecoratorUse = {
  readonly name: string;
  readonly args: readonly unknown[];
};

export type CustomDecoratorMapping =
  | readonly DecoratorSpec[]
  | ((use: CustomDecoratorUse) => readonly DecoratorSpec[]);

export type DecoratorExpansionOptions = {
  readonly decorators?: Readonly<Record<string, CustomDecoratorMapping>>;
};

const MAX_DEPTH = 10;

const NO_MAPPINGS: DecoratorExpansionOptions = {};

const toUserValue = (value: StaticValue): unknown => {
  switch (value.kind) {
    case 'literal':
      return value.value;
    case 'array':
      return value.items.map(toUserValue);
    case 'object':
      return Object.fromEntries(
        Object.entries(value.properties).map(([key, item]) => [
          key,
          toUserValue(item),
        ]),
      );
    case 'reference':
      return new TypeRef(value.name, value.node);
    case 'thunk':
      return toUserValue(value.value);
    default:
      return undefined;
  }
};

const fromUserValue = (value: unknown, depth = 0): StaticValue => {
  if (depth > MAX_DEPTH) return literal(undefined);
  if (value instanceof TypeRef) {
    return { kind: 'reference', name: value.name, node: value.node };
  }
  if (Array.isArray(value)) {
    return {
      kind: 'array',
      items: value.map((item) => fromUserValue(item, depth + 1)),
    };
  }
  if (typeof value === 'function') {
    return {
      kind: 'thunk',
      value: fromUserValue((value as () => unknown)(), depth + 1),
    };
  }
  if (value === null || typeof value !== 'object') {
    return literal(value as string | number | boolean | null | undefined);
  }
  return {
    kind: 'object',
    properties: Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        fromUserValue(item, depth + 1),
      ]),
    ),
  };
};

const unwrapExpression = (node: Node): Node => {
  if (
    Node.isParenthesizedExpression(node) ||
    Node.isAsExpression(node) ||
    Node.isSatisfiesExpression(node) ||
    Node.isNonNullExpression(node)
  ) {
    return unwrapExpression(node.getExpression());
  }
  return node;
};

const resolveWrapperFunction = (callee: Node) => {
  for (const declaration of resolveDeclarations(callee)) {
    if (!isUserCode(declaration)) continue;
    const fn = Node.isVariableDeclaration(declaration)
      ? declaration.getInitializer()
      : declaration;
    if (!fn) continue;
    const returned = getReturnedExpression(unwrapExpression(fn));
    if (!returned) continue;
    const result = unwrapExpression(returned);
    if (!Node.isCallExpression(result)) continue;
    return {
      parameters: (fn as Node & { getParameters(): Node[] }).getParameters(),
      result,
    };
  }
  return undefined;
};

const resolveWrapperConstant = (identifier: Node) => {
  for (const declaration of resolveDeclarations(identifier)) {
    if (!isUserCode(declaration) || !Node.isVariableDeclaration(declaration)) {
      continue;
    }
    const initializer = declaration.getInitializer();
    const result = initializer && unwrapExpression(initializer);
    if (result && Node.isCallExpression(result)) return result;
  }
  return undefined;
};

const memoize = (compute: () => StaticValue) => {
  let cached: StaticValue | undefined;
  return () => (cached ??= compute());
};

const bindParameters = (
  parameters: readonly Node[],
  args: readonly Node[],
  callerEnvironment: StaticEnvironment,
) => {
  const environment = new Map<string, () => StaticValue>();

  parameters.forEach((parameter, index) => {
    if (!Node.isParameterDeclaration(parameter)) return;

    const initializer = parameter.getInitializer();
    const argumentValue = memoize(() => {
      if (parameter.isRestParameter()) {
        return {
          kind: 'array',
          items: args
            .slice(index)
            .map((arg) => evaluate(arg, callerEnvironment)),
        };
      }
      const arg = args[index];
      if (arg) return evaluate(arg, callerEnvironment);
      if (!initializer) return literal(undefined);
      return evaluate(initializer, environment);
    });

    const nameNode = parameter.getNameNode();
    if (Node.isIdentifier(nameNode)) {
      environment.set(nameNode.getText(), argumentValue);
      return;
    }
    if (!Node.isObjectBindingPattern(nameNode)) return;

    for (const element of nameNode.getElements()) {
      const key = element.getPropertyNameNode()?.getText() ?? element.getName();
      const elementDefault = element.getInitializer();
      environment.set(
        element.getName(),
        memoize(() => {
          const container = argumentValue();
          const value =
            container.kind === 'object' ? container.properties[key] : undefined;
          if (
            value &&
            !(value.kind === 'literal' && value.value === undefined)
          ) {
            return value;
          }
          if (!elementDefault) return literal(undefined);
          return evaluate(elementDefault, environment);
        }),
      );
    }
  });

  return environment;
};

const expandMapping = (
  mapping: CustomDecoratorMapping,
  name: string,
  args: readonly StaticValue[],
  via: readonly string[],
  node: Node,
  options: DecoratorExpansionOptions,
  depth: number,
): readonly DecoratorCall[] => {
  const specs =
    typeof mapping === 'function'
      ? mapping({ name, args: args.map(toUserValue) })
      : mapping;

  return specs.flatMap((spec) => {
    const specArgs = (spec.args ?? []).map((arg) => fromUserValue(arg));
    const nested = options.decorators?.[spec.name];
    const expandsFurther =
      nested &&
      spec.name !== name &&
      !via.includes(spec.name) &&
      depth < MAX_DEPTH;
    if (!expandsFurther)
      return [{ name: spec.name, args: specArgs, via, node }];
    return expandMapping(
      nested,
      spec.name,
      specArgs,
      [...via, spec.name],
      node,
      options,
      depth + 1,
    );
  });
};

const expandExpression = (
  expression: Node,
  environment: StaticEnvironment,
  via: readonly string[],
  options: DecoratorExpansionOptions,
  depth: number,
): readonly DecoratorCall[] => {
  const node = unwrapExpression(expression);
  const canFollow = (name: string) => depth < MAX_DEPTH && !via.includes(name);

  if (!Node.isCallExpression(node)) {
    const name = getCalleeName(node);
    if (!name) return [];

    const mapping = options.decorators?.[name];
    if (mapping) {
      return expandMapping(
        mapping,
        name,
        [],
        [...via, name],
        node,
        options,
        depth + 1,
      );
    }
    const constant = canFollow(name) ? resolveWrapperConstant(node) : undefined;
    if (!constant) return [{ name, args: [], via, node }];
    return expandExpression(
      constant,
      EMPTY_ENVIRONMENT,
      [...via, name],
      options,
      depth + 1,
    );
  }

  const callee = node.getExpression();
  const name = getCalleeName(callee);
  const args = node.getArguments();
  if (!name) return [];

  if (name === 'applyDecorators') {
    return args.flatMap((arg) =>
      Node.isSpreadElement(arg)
        ? []
        : expandExpression(arg, environment, via, options, depth + 1),
    );
  }

  const mapping = options.decorators?.[name];
  if (mapping) {
    return expandMapping(
      mapping,
      name,
      args.map((arg) => evaluate(arg, environment)),
      [...via, name],
      node,
      options,
      depth + 1,
    );
  }

  const wrapper = canFollow(name) ? resolveWrapperFunction(callee) : undefined;
  if (!wrapper) {
    return [
      { name, args: args.map((arg) => evaluate(arg, environment)), via, node },
    ];
  }
  return expandExpression(
    wrapper.result,
    bindParameters(wrapper.parameters, args, environment),
    [...via, name],
    options,
    depth + 1,
  );
};

const expansionCache = new WeakMap<
  Decorator,
  WeakMap<DecoratorExpansionOptions, readonly DecoratorCall[]>
>();

const expandDecorator = (
  decorator: Decorator,
  options: DecoratorExpansionOptions,
) => {
  const byOptions = expansionCache.get(decorator) ?? new WeakMap();
  const cached = byOptions.get(options);
  if (cached) return cached;

  const calls = expandExpression(
    decorator.getExpression(),
    EMPTY_ENVIRONMENT,
    [],
    options,
    0,
  );
  byOptions.set(options, calls);
  expansionCache.set(decorator, byOptions);
  return calls;
};

type Decoratable = Node & { getDecorators(): Decorator[] };

export const getEffectiveDecorators = (
  node: Decoratable,
  options: DecoratorExpansionOptions = NO_MAPPINGS,
) =>
  node
    .getDecorators()
    .flatMap((decorator) => expandDecorator(decorator, options));

export const findDecorators = (
  node: Decoratable,
  name: string,
  options?: DecoratorExpansionOptions,
) => getEffectiveDecorators(node, options).filter((call) => call.name === name);

export const findDecorator = (
  node: Decoratable,
  name: string,
  options?: DecoratorExpansionOptions,
) => findDecorators(node, name, options)[0];

export const getDecoratorNames = (
  node: Decoratable,
  options?: DecoratorExpansionOptions,
) => [
  ...new Set(
    getEffectiveDecorators(node, options).flatMap((call) => [
      ...call.via,
      call.name,
    ]),
  ),
];
