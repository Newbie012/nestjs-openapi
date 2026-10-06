import { Node, type ClassDeclaration, type Expression } from 'ts-morph';
import { getCalleeName, resolveDeclarations } from './ast.js';
import type { GeneratedSchemas, JsonSchema } from './schema-generator.js';
import { asStrings, evaluate } from './static-value.js';

export const MAPPED_TYPE_HELPERS: ReadonlySet<string> = new Set([
  'PartialType',
  'PickType',
  'OmitType',
  'IntersectionType',
]);

const isMappedTypeCall = (node: Node) => {
  if (!Node.isCallExpression(node)) return false;
  const name = getCalleeName(node.getExpression());
  return name !== undefined && MAPPED_TYPE_HELPERS.has(name);
};

const ownName = (name: string) => name;

export const getMappedTypeBase = (classDecl: ClassDeclaration) => {
  const expression = classDecl.getExtends()?.getExpression();
  return expression && isMappedTypeCall(expression) ? expression : undefined;
};

export const collectMappedTypeBases = (
  expression: Expression,
  componentName: (name: string, node: Node) => string = ownName,
) => {
  const bases = new Map<string, ClassDeclaration>();
  const visit = (node: Node): void => {
    if (Node.isCallExpression(node)) {
      if (isMappedTypeCall(node)) node.getArguments().forEach(visit);
      return;
    }
    if (Node.isIdentifier(node)) {
      const classDecl = resolveDeclarations(node).find(Node.isClassDeclaration);
      const className = classDecl?.getName();
      if (classDecl && className) {
        bases.set(componentName(className, node), classDecl);
      }
    }
  };
  visit(expression);
  return bases;
};

type ObjectShape = {
  readonly properties: Record<string, JsonSchema>;
  readonly required: readonly string[];
};

const EMPTY_SHAPE: ObjectShape = { properties: {}, required: [] };

const toShape = (schema: JsonSchema | undefined): ObjectShape =>
  schema
    ? {
        properties: { ...(schema.properties ?? {}) },
        required: [...(schema.required ?? [])],
      }
    : EMPTY_SHAPE;

const readKeys = (node: Node | undefined) => {
  const value = node ? evaluate(node) : undefined;
  return new Set(value?.kind === 'array' ? asStrings(value.items) : []);
};

const pickShape = (
  shape: ObjectShape,
  keep: (key: string) => boolean,
): ObjectShape => ({
  properties: Object.fromEntries(
    Object.entries(shape.properties).filter(([key]) => keep(key)),
  ),
  required: shape.required.filter(keep),
});

const mergeShapes = (shapes: readonly ObjectShape[]): ObjectShape => ({
  properties: Object.assign({}, ...shapes.map((shape) => shape.properties)),
  required: [...new Set(shapes.flatMap((shape) => shape.required))],
});

// The schema generator cannot evaluate mapped-type helper calls, so it only
// sees a class's own properties; the inherited part is composed here from
// the base classes' schemas
export const applyMappedTypes = (
  schemas: GeneratedSchemas,
  classes: ReadonlyMap<string, ClassDeclaration>,
  componentName: (name: string, node: Node) => string = ownName,
): GeneratedSchemas => {
  const definitions = { ...schemas.definitions };
  const composed = new Map<string, ObjectShape>();
  const inProgress = new Set<string>();

  const shapeOfClass = (
    name: string,
    classDecl?: ClassDeclaration,
  ): ObjectShape => {
    const done = composed.get(name);
    if (done) return done;

    const declaration = classDecl ?? classes.get(name);
    const base = declaration ? getMappedTypeBase(declaration) : undefined;
    if (!base || inProgress.has(name)) return toShape(definitions[name]);

    inProgress.add(name);
    const shape = mergeShapes([
      shapeOfExpression(base),
      toShape(definitions[name]),
    ]);
    inProgress.delete(name);
    composed.set(name, shape);
    return shape;
  };

  const shapeOfExpression = (node: Node): ObjectShape => {
    if (Node.isCallExpression(node)) {
      const name = getCalleeName(node.getExpression());
      const [first, second, ...rest] = node.getArguments();
      switch (name) {
        case 'PartialType':
          return first
            ? { ...shapeOfExpression(first), required: [] }
            : EMPTY_SHAPE;
        case 'PickType': {
          const keys = readKeys(second);
          return first
            ? pickShape(shapeOfExpression(first), (key) => keys.has(key))
            : EMPTY_SHAPE;
        }
        case 'OmitType': {
          const keys = readKeys(second);
          return first
            ? pickShape(shapeOfExpression(first), (key) => !keys.has(key))
            : EMPTY_SHAPE;
        }
        case 'IntersectionType':
          return mergeShapes(
            [first, second, ...rest]
              .filter((arg): arg is Node => arg !== undefined)
              .map(shapeOfExpression),
          );
        default:
          return EMPTY_SHAPE;
      }
    }

    if (Node.isIdentifier(node)) {
      const classDecl = resolveDeclarations(node).find(Node.isClassDeclaration);
      const name = componentName(classDecl?.getName() ?? node.getText(), node);
      return shapeOfClass(name, classDecl);
    }

    return EMPTY_SHAPE;
  };

  for (const [name, classDecl] of classes) {
    if (!definitions[name] || !getMappedTypeBase(classDecl)) continue;

    const shape = shapeOfClass(name, classDecl);
    const { required: _required, ...schema } = definitions[name]!;
    definitions[name] = {
      ...schema,
      type: 'object',
      properties: shape.properties,
      ...(shape.required.length > 0 ? { required: [...shape.required] } : {}),
    };
  }

  return { definitions };
};
