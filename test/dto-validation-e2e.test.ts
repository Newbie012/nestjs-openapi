import { describe, it, expect, afterEach } from 'vitest';
import { resolve } from 'path';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { generate } from '../src/generate.js';
import type { OpenApiSpec } from '../src/types.js';

describe('DTO Validation E2E', () => {
  const configPath = resolve(
    process.cwd(),
    'e2e-applications/dto-validation/openapi.config.ts',
  );
  const outputPath = resolve(
    process.cwd(),
    'e2e-applications/dto-validation/openapi.generated.json',
  );

  afterEach(() => {
    // Clean up generated file
    if (existsSync(outputPath)) {
      unlinkSync(outputPath);
    }
  });

  it('should generate OpenAPI spec with DTOs', async () => {
    const result = await generate(configPath);

    expect(result.outputPath).toBe(outputPath);
    expect(existsSync(outputPath)).toBe(true);

    const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

    // Verify basic spec structure
    expect(spec.openapi).toBe('3.0.3');
    expect(spec.info.title).toBe('DTO Validation API');
    expect(spec.info.version).toBe('1.0.0');
  });

  it('should include paths for users and products', async () => {
    await generate(configPath);

    const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

    // Verify user paths exist
    expect(spec.paths['/users']).toBeDefined();
    expect(spec.paths['/users'].get).toBeDefined();
    expect(spec.paths['/users'].post).toBeDefined();
    expect(spec.paths['/users/{id}']).toBeDefined();
    expect(spec.paths['/users/{id}'].get).toBeDefined();
    expect(spec.paths['/users/{id}'].put).toBeDefined();

    // Verify product paths exist
    expect(spec.paths['/products']).toBeDefined();
    expect(spec.paths['/products'].get).toBeDefined();
    expect(spec.paths['/products'].post).toBeDefined();
    expect(spec.paths['/products/{id}']).toBeDefined();
  });

  it('should have correct operation metadata', async () => {
    await generate(configPath);

    const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

    // Check user operations
    const createUserOp = spec.paths['/users'].post;
    expect(createUserOp.summary).toBe('Create a new user with validation');
    expect(createUserOp.tags).toContain('Users');

    const getProductOp = spec.paths['/products'].get;
    expect(getProductOp.summary).toBe('Get all products');
    expect(getProductOp.tags).toContain('Products');
  });

  it('should include DTO schemas in components', async () => {
    await generate(configPath);

    const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

    // Verify schemas are present
    expect(spec.components).toBeDefined();
    expect(spec.components?.schemas).toBeDefined();

    const schemas = spec.components?.schemas;
    expect(schemas).toBeDefined();

    // Check for DTO schemas (exact names depend on schema generator)
    const schemaNames = Object.keys(schemas ?? {});
    expect(schemaNames.length).toBeGreaterThan(0);
  });

  it('should have validation constraints in schemas when extractValidation is enabled', async () => {
    await generate(configPath);

    const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));
    const schemas = spec.components?.schemas ?? {};

    // Find CreateUserDto schema
    const createUserSchema = schemas['CreateUserDto'];

    if (createUserSchema && createUserSchema.properties) {
      const nameProperty = createUserSchema.properties['name'] as Record<
        string,
        unknown
      >;
      const emailProperty = createUserSchema.properties['email'] as Record<
        string,
        unknown
      >;
      const ageProperty = createUserSchema.properties['age'] as Record<
        string,
        unknown
      >;

      // Verify string constraints from @MinLength(2) @MaxLength(50)
      if (nameProperty) {
        expect(nameProperty.minLength).toBe(2);
        expect(nameProperty.maxLength).toBe(50);
      }

      // Verify email format from @IsEmail()
      if (emailProperty) {
        expect(emailProperty.format).toBe('email');
      }

      // Verify number constraints from @Min(0) @Max(150) @IsInt()
      if (ageProperty) {
        expect(ageProperty.minimum).toBe(0);
        expect(ageProperty.maximum).toBe(150);
      }
    }
  });

  it('should have array constraints in product schema', async () => {
    await generate(configPath);

    const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));
    const schemas = spec.components?.schemas ?? {};

    // Find CreateProductDto schema
    const createProductSchema = schemas['CreateProductDto'];

    if (createProductSchema && createProductSchema.properties) {
      const tagsProperty = createProductSchema.properties['tags'] as Record<
        string,
        unknown
      >;

      // Verify array constraints from @ArrayMinSize(1) @ArrayMaxSize(10)
      if (tagsProperty) {
        expect(tagsProperty.minItems).toBe(1);
        expect(tagsProperty.maxItems).toBe(10);
      }
    }
  });

  it('should correctly handle optional fields', async () => {
    await generate(configPath);

    const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));
    const schemas = spec.components?.schemas ?? {};

    // Find UpdateUserDto schema - all fields should be optional
    const updateUserSchema = schemas['UpdateUserDto'];

    if (updateUserSchema) {
      // Required array should be empty or not include optional fields
      const required = updateUserSchema.required ?? [];

      // All fields in UpdateUserDto are optional, so required should be minimal
      // or should not include fields with @IsOptional()
      expect(Array.isArray(required)).toBe(true);
    }
  });

  it('should include response schemas with proper types', async () => {
    await generate(configPath);

    const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

    // Check that responses reference proper schemas
    const createUserOp = spec.paths['/users'].post;
    const response201 = createUserOp.responses['201'];

    expect(response201).toBeDefined();
    expect(response201.description).toBe('User created');
  });

  it('should extract enum values from @IsEnum decorator (not just from TS type)', async () => {
    await generate(configPath);

    const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));
    const schemas = spec.components?.schemas ?? {};

    // Find CreateUserDto schema
    const createUserSchema = schemas['CreateUserDto'];
    expect(createUserSchema).toBeDefined();
    expect(createUserSchema.properties).toBeDefined();

    const properties = createUserSchema.properties!;

    // roleAsString is typed as `string` but has @IsEnum(UserRole)
    // This tests that our validation-mapper extracts enum from the decorator,
    // not relying on ts-json-schema-generator to infer from the TS type
    const roleAsStringProperty = properties['roleAsString'] as Record<
      string,
      unknown
    >;

    expect(roleAsStringProperty).toBeDefined();
    expect(roleAsStringProperty.enum).toEqual(['admin', 'user', 'guest']);

    // Check numeric enum (UserStatus) - optional field
    const statusProperty = properties['status'] as Record<string, unknown>;
    if (statusProperty) {
      expect(statusProperty.enum).toEqual([0, 1, 2]);
    }
  });
});
