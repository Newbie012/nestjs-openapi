/**
 * Validation Mapper - Maps class-validator decorators to OpenAPI constraints
 *
 * This module extracts validation information from class-validator decorators
 * in TypeScript source files and applies them to JSON Schema definitions.
 */

import { Option } from 'effect';
import type {
  ClassDeclaration,
  PropertyDeclaration,
  EnumDeclaration,
} from 'ts-morph';
import { ts, Node } from 'ts-morph';
import type { JsonSchema, GeneratedSchemas } from './schema-generator.js';

// Validation constraint types

export interface ValidationConstraints {
  // String constraints
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly format?: string;

  // Number constraints
  readonly minimum?: number;
  readonly maximum?: number;
  readonly exclusiveMinimum?: number;
  readonly exclusiveMaximum?: number;

  // Array constraints
  readonly minItems?: number;
  readonly maxItems?: number;

  // Enum constraint
  readonly enum?: readonly unknown[];

  // Type override
  readonly type?: string;
}

/**
 * Get the name of a decorator
 */
const getDecoratorName = (
  decorator: PropertyDeclaration['getDecorators'] extends () => (infer D)[]
    ? D
    : never,
): Option.Option<string> => {
  const callExpr = decorator.getCallExpression();
  if (!callExpr) {
    // Decorator without parentheses: @Decorator
    const nameNode = decorator.getName();
    return Option.fromNullable(nameNode);
  }

  // Decorator with parentheses: @Decorator() or @Decorator(args)
  const expr = callExpr.getExpression();
  if (expr.getKind() === ts.SyntaxKind.Identifier) {
    return Option.some(expr.getText());
  }

  return Option.none();
};

/**
 * Mapping from class-validator decorators to OpenAPI constraints
 */
const DECORATOR_MAPPINGS: Record<
  string,
  (args: readonly string[]) => Partial<ValidationConstraints>
> = {
  // Type validators
  IsString: () => ({ type: 'string' }),
  IsNumber: () => ({ type: 'number' }),
  IsInt: () => ({ type: 'integer' }),
  IsBoolean: () => ({ type: 'boolean' }),
  IsArray: () => ({ type: 'array' }),
  IsObject: () => ({ type: 'object' }),
  IsDate: () => ({ type: 'string', format: 'date-time' }),

  // String format validators
  IsEmail: () => ({ format: 'email' }),
  IsUrl: () => ({ format: 'uri' }),
  IsUUID: () => ({ format: 'uuid' }),
  IsDateString: () => ({ format: 'date-time' }),
  IsISO8601: () => ({ format: 'date-time' }),
  IsPhoneNumber: () => ({ format: 'phone' }),
  IsCreditCard: () => ({ format: 'credit-card' }),
  IsIP: () => ({ format: 'ipv4' }),
  IsJSON: () => ({ format: 'json' }),

  // String length validators
  MinLength: (args) => ({ minLength: parseNumber(args[0]) }),
  MaxLength: (args) => ({ maxLength: parseNumber(args[0]) }),
  Length: (args) => ({
    minLength: parseNumber(args[0]),
    maxLength: parseNumber(args[1]) ?? parseNumber(args[0]),
  }),

  // String pattern validators
  Matches: (args) => {
    const pattern = args[0];
    if (pattern) {
      // Remove leading/trailing slashes and flags from regex literals
      const cleanPattern = pattern.replace(/^\/(.*)\/[gimsuvy]*$/, '$1');
      return { pattern: cleanPattern };
    }
    return {};
  },

  // Number validators
  Min: (args) => ({ minimum: parseNumber(args[0]) }),
  Max: (args) => ({ maximum: parseNumber(args[0]) }),
  IsPositive: () => ({ exclusiveMinimum: 0 }),
  IsNegative: () => ({ exclusiveMaximum: 0 }),

  // Array validators
  ArrayMinSize: (args) => ({ minItems: parseNumber(args[0]) }),
  ArrayMaxSize: (args) => ({ maxItems: parseNumber(args[0]) }),

  // Enum validator - static analysis can't easily extract enum values
  IsEnum: () => ({}),

  // Other validators (these don't map directly to OpenAPI but inform the schema)
  IsOptional: () => ({}), // Handled separately via required array
  IsNotEmpty: () => ({ minLength: 1 }),
  IsDefined: () => ({}),
  IsEmpty: () => ({}),

  // Nested/type validators
  ValidateNested: () => ({}),
  Type: () => ({}),
};

/**
 * Parse a string to a number, returning undefined if invalid
 */
const parseNumber = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const num = Number(value);
  return isNaN(num) ? undefined : num;
};

/** Extract text arguments from a decorator's call expression */
const getDecoratorArgs = (
  decorator: Parameters<typeof getDecoratorName>[0],
): readonly string[] => {
  const callExpr = decorator.getCallExpression();
  if (!callExpr) return [];
  return callExpr.getArguments().map((arg) => arg.getText());
};

/**
 * Extract enum values from a TypeScript enum declaration
 */
const extractEnumValues = (
  enumDecl: EnumDeclaration,
): readonly (string | number)[] => {
  const values: (string | number)[] = [];
  let currentValue = 0;

  for (const member of enumDecl.getMembers()) {
    const initializer = member.getInitializer();

    if (initializer) {
      // Has explicit initializer
      if (Node.isStringLiteral(initializer)) {
        values.push(initializer.getLiteralValue());
      } else if (Node.isNumericLiteral(initializer)) {
        const numValue = initializer.getLiteralValue();
        values.push(numValue);
        currentValue = numValue + 1;
      } else {
        // Try to evaluate the expression (e.g., computed values)
        const text = initializer.getText();
        const num = Number(text);
        if (!isNaN(num)) {
          values.push(num);
          currentValue = num + 1;
        } else {
          // String value without quotes in source - try literal text
          values.push(text);
        }
      }
    } else {
      // Auto-incrementing numeric value
      values.push(currentValue);
      currentValue++;
    }
  }

  return values;
};

/**
 * Resolve an enum from a decorator argument like @IsEnum(MyEnum)
 */
const resolveEnumFromDecorator = (
  decorator: Parameters<typeof getDecoratorName>[0],
): readonly (string | number)[] | undefined => {
  const callExpr = decorator.getCallExpression();
  if (!callExpr) return undefined;

  const args = callExpr.getArguments();
  if (args.length === 0) return undefined;

  const firstArg = args[0];

  // The argument should be an identifier referencing the enum
  if (!Node.isIdentifier(firstArg)) return undefined;

  // Try to resolve the symbol and find the enum declaration
  const symbol = firstArg.getSymbol();
  if (!symbol) return undefined;

  // Get declarations for this symbol
  const declarations = symbol.getDeclarations();
  if (!declarations || declarations.length === 0) return undefined;

  // Find an enum declaration
  for (const decl of declarations) {
    if (Node.isEnumDeclaration(decl)) {
      return extractEnumValues(decl);
    }
  }

  // Try to find via import
  // The symbol might point to an import specifier
  for (const decl of declarations) {
    if (Node.isImportSpecifier(decl)) {
      // Follow the import to the actual declaration
      const localSymbol = decl.getSymbol();
      const aliasedSymbol = localSymbol?.getAliasedSymbol();

      if (aliasedSymbol) {
        const aliasedDecls = aliasedSymbol.getDeclarations();
        for (const aliasedDecl of aliasedDecls ?? []) {
          if (Node.isEnumDeclaration(aliasedDecl)) {
            return extractEnumValues(aliasedDecl);
          }
        }
      }
    }
  }

  return undefined;
};

/**
 * Extract validation constraints from a property's decorators
 */
export const extractPropertyConstraints = (
  property: PropertyDeclaration,
): ValidationConstraints => {
  const constraints: ValidationConstraints = {};

  for (const decorator of property.getDecorators()) {
    const nameOpt = getDecoratorName(decorator);
    if (Option.isNone(nameOpt)) continue;

    // Special handling for @IsEnum - extract actual enum values
    if (nameOpt.value === 'IsEnum') {
      const enumValues = resolveEnumFromDecorator(decorator);
      if (enumValues && enumValues.length > 0) {
        Object.assign(constraints, { enum: enumValues });
      }
      continue;
    }

    const mapper = DECORATOR_MAPPINGS[nameOpt.value];
    if (!mapper) continue;

    Object.assign(constraints, mapper(getDecoratorArgs(decorator)));
  }

  return constraints;
};

/**
 * Check if a property has @IsOptional() decorator
 */
export const isPropertyOptional = (property: PropertyDeclaration): boolean => {
  const decorators = property.getDecorators();
  return decorators.some((d) => {
    const nameOpt = getDecoratorName(d);
    return Option.isSome(nameOpt) && nameOpt.value === 'IsOptional';
  });
};

/**
 * Extract all property constraints from a class
 */
export const extractClassConstraints = (
  classDecl: ClassDeclaration,
): Record<string, ValidationConstraints> => {
  const result: Record<string, ValidationConstraints> = {};
  const properties = classDecl.getProperties();

  for (const property of properties) {
    const name = property.getName();
    const constraints = extractPropertyConstraints(property);

    if (Object.keys(constraints).length > 0) {
      result[name] = constraints;
    }
  }

  return result;
};

/**
 * Get required property names from a class (those without @IsOptional)
 */
export const getRequiredProperties = (
  classDecl: ClassDeclaration,
): readonly string[] => {
  const properties = classDecl.getProperties();
  const required: string[] = [];

  for (const property of properties) {
    if (!isPropertyOptional(property)) {
      required.push(property.getName());
    }
  }

  return required;
};

/**
 * Apply validation constraints to a JSON Schema
 */
export const applyConstraintsToSchema = (
  schema: JsonSchema,
  propertyConstraints: Record<string, ValidationConstraints>,
  requiredProperties?: readonly string[],
): JsonSchema => {
  const updated: Record<string, unknown> = { ...schema };

  // Apply constraints to properties
  if (schema.properties && Object.keys(propertyConstraints).length > 0) {
    const updatedProperties: Record<string, JsonSchema> = {};

    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      const constraints = propertyConstraints[propName];

      if (constraints) {
        updatedProperties[propName] = {
          ...propSchema,
          ...constraints,
        } as JsonSchema;
      } else {
        updatedProperties[propName] = propSchema;
      }
    }

    updated.properties = updatedProperties;
  }

  // Update required array if provided
  if (requiredProperties && requiredProperties.length > 0) {
    const existingRequired = new Set(schema.required ?? []);
    for (const prop of requiredProperties) {
      existingRequired.add(prop);
    }
    updated.required = [...existingRequired];
  }

  return updated as JsonSchema;
};

/**
 * Merge validation constraints into generated schemas
 */
export const mergeValidationConstraints = (
  schemas: GeneratedSchemas,
  classConstraints: Map<string, Record<string, ValidationConstraints>>,
  classRequired: Map<string, readonly string[]>,
): GeneratedSchemas => {
  const updatedDefinitions: Record<string, JsonSchema> = {};

  for (const [name, schema] of Object.entries(schemas.definitions)) {
    const constraints = classConstraints.get(name);
    const required = classRequired.get(name);

    if (constraints || required) {
      updatedDefinitions[name] = applyConstraintsToSchema(
        schema,
        constraints ?? {},
        required,
      );
    } else {
      updatedDefinitions[name] = schema;
    }
  }

  return { definitions: updatedDefinitions };
};
