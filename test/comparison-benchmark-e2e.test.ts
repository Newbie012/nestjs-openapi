/**
 * Comparison Benchmark E2E Test
 *
 * This test compares the output of @nestjs/swagger CLI plugin with nestjs-openapi
 * to verify the claims made in the comparison documentation.
 *
 * The benchmark app at e2e-applications/comparison-benchmark contains test cases for:
 * - Union types (string literals)
 * - Enums
 * - Interfaces
 * - Nullable types
 * - Generic types
 * - Discriminated unions
 * - Parameter decorators (@Query, @Param, @Body)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { generate } from '../src/index.js';

describe('Comparison Benchmark: @nestjs/swagger vs nestjs-openapi', () => {
  let swaggerOutput: any;
  let staticOutput: any;

  beforeAll(async () => {
    const benchmarkDir = path.join(
      __dirname,
      '../e2e-applications/comparison-benchmark',
    );

    // Read the pre-generated swagger output (generated via `nest build && node dist/main.js`)
    const swaggerPath = path.join(benchmarkDir, 'swagger-output.json');
    if (fs.existsSync(swaggerPath)) {
      swaggerOutput = JSON.parse(fs.readFileSync(swaggerPath, 'utf-8'));
    }

    // Generate with our library
    await generate(path.join(benchmarkDir, 'openapi.config.ts'));
    const staticPath = path.join(benchmarkDir, 'static-output.json');
    staticOutput = JSON.parse(fs.readFileSync(staticPath, 'utf-8'));
  });

  describe('Schema Generation', () => {
    it('@nestjs/swagger CLI plugin produces EMPTY schemas for DTOs', () => {
      // This proves that the CLI plugin doesn't populate DTO properties
      const swaggerSchemas = swaggerOutput?.components?.schemas || {};

      // All schemas should be empty objects
      expect(swaggerSchemas.CreateOrderDto).toEqual({
        type: 'object',
        properties: {},
      });
      expect(swaggerSchemas.UserDto).toEqual({
        type: 'object',
        properties: {},
      });
      expect(swaggerSchemas.UpdateUserDto).toEqual({
        type: 'object',
        properties: {},
      });
    });

    it('nestjs-openapi produces COMPLETE schemas with all properties', () => {
      const staticSchemas = staticOutput?.components?.schemas || {};

      // CreateOrderDto should have status (union type) and notes (optional)
      expect(staticSchemas.CreateOrderDto.properties).toHaveProperty('status');
      expect(staticSchemas.CreateOrderDto.properties).toHaveProperty('notes');

      // UserDto should have all properties including interface reference
      expect(staticSchemas.UserDto.properties).toHaveProperty('id');
      expect(staticSchemas.UserDto.properties).toHaveProperty('name');
      expect(staticSchemas.UserDto.properties).toHaveProperty('email');
      expect(staticSchemas.UserDto.properties).toHaveProperty('role');
      expect(staticSchemas.UserDto.properties).toHaveProperty('address');
    });
  });

  describe('Union Types (String Literals)', () => {
    it('nestjs-openapi extracts union types as enums', () => {
      const staticSchemas = staticOutput?.components?.schemas || {};

      // OrderStatus should be extracted as enum
      expect(staticSchemas.OrderStatus).toEqual({
        type: 'string',
        enum: ['pending', 'shipped', 'delivered'],
      });
    });
  });

  describe('Enums', () => {
    it('nestjs-openapi correctly extracts enum values', () => {
      const staticSchemas = staticOutput?.components?.schemas || {};

      expect(staticSchemas.Role).toEqual({
        type: 'string',
        enum: ['admin', 'user', 'guest'],
      });
    });
  });

  describe('Interfaces', () => {
    it('nestjs-openapi generates schemas for interfaces', () => {
      const staticSchemas = staticOutput?.components?.schemas || {};

      // Address interface should be fully resolved
      expect(staticSchemas.Address).toBeDefined();
      expect(staticSchemas.Address.properties).toHaveProperty('street');
      expect(staticSchemas.Address.properties).toHaveProperty('city');
      expect(staticSchemas.Address.properties).toHaveProperty('zipCode');
    });
  });

  describe('Nullable Types', () => {
    it('nestjs-openapi handles nullable types correctly', () => {
      const staticSchemas = staticOutput?.components?.schemas || {};

      // bio: string | null should have nullable representation
      const bioType = staticSchemas.UpdateUserDto?.properties?.bio?.type;
      expect(bioType).toEqual(['string', 'null']);

      // age: number | null
      const ageType = staticSchemas.UpdateUserDto?.properties?.age?.type;
      expect(ageType).toEqual(['number', 'null']);
    });
  });

  describe('Generic Types', () => {
    it('@nestjs/swagger returns empty response for generic return types', () => {
      // GET /api/users returns PaginatedResponse<UserDto>
      const getUsersResponse =
        swaggerOutput?.paths?.['/api/users']?.get?.responses?.['200'];

      // Should have no content schema or empty description
      expect(getUsersResponse?.content).toBeUndefined();
    });

    it('nestjs-openapi preserves generic type references', () => {
      const getUsersResponse =
        staticOutput?.paths?.['/api/users']?.get?.responses?.['200'];

      // Should reference the generic type
      expect(
        getUsersResponse?.content?.['application/json']?.schema?.$ref,
      ).toContain('PaginatedResponse');
    });
  });

  describe('Discriminated Unions', () => {
    it('@nestjs/swagger returns plain object for discriminated unions', () => {
      const response =
        swaggerOutput?.paths?.['/api/users/{id}/response']?.get?.responses?.[
          '200'
        ];

      // Should be just { type: 'object' }
      expect(response?.content?.['application/json']?.schema).toEqual({
        type: 'object',
      });
    });

    it('nestjs-openapi references the discriminated union type', () => {
      const response =
        staticOutput?.paths?.['/api/users/{id}/response']?.get?.responses?.[
          '200'
        ];

      // Should reference the union type
      expect(response?.content?.['application/json']?.schema?.$ref).toContain(
        'ApiResponseType',
      );
    });
  });

  describe('Parameter Decorators (@Query, @Param)', () => {
    it('@nestjs/swagger CLI plugin DOES correctly infer parameter types', () => {
      // This is actually working in @nestjs/swagger!
      const searchParams =
        swaggerOutput?.paths?.['/api/search']?.get?.parameters;

      const qParam = searchParams?.find((p: any) => p.name === 'q');
      const pageParam = searchParams?.find((p: any) => p.name === 'page');
      const limitParam = searchParams?.find((p: any) => p.name === 'limit');
      const activeParam = searchParams?.find((p: any) => p.name === 'active');

      expect(qParam?.schema?.type).toBe('string');
      expect(pageParam?.schema?.type).toBe('number');
      expect(limitParam?.schema?.type).toBe('number');
      expect(activeParam?.schema?.type).toBe('boolean');
    });

    it('nestjs-openapi also correctly infers parameter types', () => {
      const searchParams =
        staticOutput?.paths?.['/api/search']?.get?.parameters;

      const qParam = searchParams?.find((p: any) => p.name === 'q');
      const pageParam = searchParams?.find((p: any) => p.name === 'page');
      const limitParam = searchParams?.find((p: any) => p.name === 'limit');
      const activeParam = searchParams?.find((p: any) => p.name === 'active');

      expect(qParam?.schema?.type).toBe('string');
      expect(pageParam?.schema?.type).toBe('number');
      expect(limitParam?.schema?.type).toBe('number');
      expect(activeParam?.schema?.type).toBe('boolean');
    });
  });

  describe('Union of Objects (property is CatDto | DogDto)', () => {
    it('@nestjs/swagger produces empty schema for DTO with union of objects', () => {
      const swaggerSchemas = swaggerOutput?.components?.schemas || {};

      // PetOwnerDto should be empty
      expect(swaggerSchemas.PetOwnerDto).toEqual({
        type: 'object',
        properties: {},
      });

      // CatDto and DogDto should not even exist
      expect(swaggerSchemas.CatDto).toBeUndefined();
      expect(swaggerSchemas.DogDto).toBeUndefined();
    });

    it('nestjs-openapi correctly handles union of objects with anyOf', () => {
      const staticSchemas = staticOutput?.components?.schemas || {};

      // PetOwnerDto should have pet property with anyOf
      expect(staticSchemas.PetOwnerDto.properties.pet.anyOf).toBeDefined();
      expect(staticSchemas.PetOwnerDto.properties.pet.anyOf).toHaveLength(2);

      // Both CatDto and DogDto should be generated
      expect(staticSchemas.CatDto).toBeDefined();
      expect(staticSchemas.CatDto.properties.name.type).toBe('string');
      expect(staticSchemas.CatDto.properties.meow.type).toBe('boolean');

      expect(staticSchemas.DogDto).toBeDefined();
      expect(staticSchemas.DogDto.properties.name.type).toBe('string');
      expect(staticSchemas.DogDto.properties.bark.type).toBe('boolean');
    });
  });

  describe('Interface as Return Type (not a class)', () => {
    it('@nestjs/swagger returns plain object for interface return type', () => {
      const response =
        swaggerOutput?.paths?.['/api/profile/{id}']?.get?.responses?.['200'];

      // Should be just { type: 'object' }
      expect(response?.content?.['application/json']?.schema).toEqual({
        type: 'object',
      });
    });

    it('nestjs-openapi correctly resolves interface return type', () => {
      const staticSchemas = staticOutput?.components?.schemas || {};
      const response =
        staticOutput?.paths?.['/api/profile/{id}']?.get?.responses?.['200'];

      // Should reference IUserProfile
      expect(response?.content?.['application/json']?.schema?.$ref).toContain(
        'IUserProfile',
      );

      // IUserProfile should be fully resolved
      expect(staticSchemas.IUserProfile).toBeDefined();
      expect(staticSchemas.IUserProfile.properties.id.type).toBe('string');
      expect(staticSchemas.IUserProfile.properties.username.type).toBe(
        'string',
      );
      expect(staticSchemas.IUserProfile.properties.displayName.type).toBe(
        'string',
      );
      // Nullable property should be handled
      expect(staticSchemas.IUserProfile.properties.avatarUrl.type).toEqual([
        'string',
        'null',
      ]);
    });
  });

  describe('Sanity Check: @ApiProperty decorators DO work', () => {
    it('@nestjs/swagger correctly populates schemas when @ApiProperty is used', () => {
      // This proves the CLI plugin IS running - decorated DTOs work
      const decoratedSchema =
        swaggerOutput?.components?.schemas?.DecoratedUserDto;

      expect(decoratedSchema).toBeDefined();
      expect(decoratedSchema.properties).toBeDefined();

      // Properties should be populated
      expect(decoratedSchema.properties.id).toEqual({
        type: 'string',
        description: 'User ID',
      });
      expect(decoratedSchema.properties.name).toEqual({
        type: 'string',
        description: 'User name',
      });
      expect(decoratedSchema.properties.email).toEqual({
        type: 'string',
        description: 'User email',
        format: 'email',
      });
      // Enum is correctly populated because we explicitly specified it
      expect(decoratedSchema.properties.role.enum).toEqual([
        'admin',
        'user',
        'guest',
      ]);

      // Required fields are set
      expect(decoratedSchema.required).toContain('id');
      expect(decoratedSchema.required).toContain('name');
      expect(decoratedSchema.required).toContain('email');
      expect(decoratedSchema.required).toContain('role');
    });

    it('HOWEVER: nullable type still shows as object even with @ApiPropertyOptional', () => {
      // bio is string | null with @ApiPropertyOptional({ nullable: true })
      // but it still shows as type: 'object'
      const decoratedSchema =
        swaggerOutput?.components?.schemas?.DecoratedUserDto;
      expect(decoratedSchema.properties.bio.type).toBe('object');
    });
  });
});
