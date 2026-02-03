import { describe, it, expect, afterEach } from 'vitest';
import { resolve } from 'path';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { generate } from '../src/generate.js';
import type { OpenApiSpec } from '../src/types.js';

describe('Import Alias E2E', () => {
  const configPath = resolve(
    process.cwd(),
    'e2e-applications/import-alias/openapi.config.ts',
  );
  const outputPath = resolve(
    process.cwd(),
    'e2e-applications/import-alias/openapi.json',
  );

  afterEach(() => {
    // Clean up generated file
    if (existsSync(outputPath)) {
      unlinkSync(outputPath);
    }
  });

  const generateSpec = async (): Promise<OpenApiSpec> => {
    await generate(configPath);
    return JSON.parse(readFileSync(outputPath, 'utf-8'));
  };

  describe('Import alias resolution', () => {
    it('should use original type names in request body refs, not alias names', async () => {
      const spec = await generateSpec();

      // POST /users uses "UserCreateRequest" alias but should ref "CreateUserDto"
      const createUserOp = spec.paths?.['/users']?.post;
      expect(createUserOp).toBeDefined();

      const createRequestBody = createUserOp?.requestBody as {
        content?: { 'application/json'?: { schema?: { $ref?: string } } };
      };
      const createRef =
        createRequestBody?.content?.['application/json']?.schema?.$ref;

      // Should reference the ORIGINAL name (CreateUserDto), not the alias (UserCreateRequest)
      expect(createRef).toBe('#/components/schemas/CreateUserDto');
    });

    it('should use original type names in PATCH body refs', async () => {
      const spec = await generateSpec();

      // PATCH /users/:id uses "UserPatchRequest" alias but should ref "UpdateUserDto"
      const patchUserOp = spec.paths?.['/users/{id}']?.patch;
      expect(patchUserOp).toBeDefined();

      const patchRequestBody = patchUserOp?.requestBody as {
        content?: { 'application/json'?: { schema?: { $ref?: string } } };
      };
      const patchRef =
        patchRequestBody?.content?.['application/json']?.schema?.$ref;

      // Should reference the ORIGINAL name (UpdateUserDto), not the alias (UserPatchRequest)
      expect(patchRef).toBe('#/components/schemas/UpdateUserDto');
    });

    it('should have schemas with original names', async () => {
      const spec = await generateSpec();

      // Schemas should use original names
      expect(spec.components?.schemas?.['UserDto']).toBeDefined();
      expect(spec.components?.schemas?.['CreateUserDto']).toBeDefined();
      expect(spec.components?.schemas?.['UpdateUserDto']).toBeDefined();

      // Alias names should NOT appear in schemas
      expect(spec.components?.schemas?.['UserResponseDto']).toBeUndefined();
      expect(spec.components?.schemas?.['UserCreateRequest']).toBeUndefined();
      expect(spec.components?.schemas?.['UserPatchRequest']).toBeUndefined();
    });
  });

  describe('Built-in generic types handling', () => {
    it('should inline Array<string> as array schema, not create broken $ref', async () => {
      const spec = await generateSpec();

      const stringArrayOp = spec.paths?.['/builtin-types/string-array']?.post;
      expect(stringArrayOp).toBeDefined();

      const requestBody = stringArrayOp?.requestBody as {
        content?: { 'application/json'?: { schema?: unknown } };
      };
      const schema = requestBody?.content?.['application/json']?.schema as {
        type?: string;
        items?: { type?: string };
        $ref?: string;
      };

      // Should be inlined as array type, NOT a $ref to "Array"
      expect(schema?.$ref).toBeUndefined();
      expect(schema?.type).toBe('array');
      expect(schema?.items?.type).toBe('string');
    });

    it('should inline string[] bracket syntax as array schema', async () => {
      const spec = await generateSpec();

      const bracketArrayOp =
        spec.paths?.['/builtin-types/string-array-bracket']?.post;
      expect(bracketArrayOp).toBeDefined();

      const requestBody = bracketArrayOp?.requestBody as {
        content?: { 'application/json'?: { schema?: unknown } };
      };
      const schema = requestBody?.content?.['application/json']?.schema as {
        type?: string;
        items?: { type?: string };
        $ref?: string;
      };

      // Should be inlined as array type
      expect(schema?.$ref).toBeUndefined();
      expect(schema?.type).toBe('array');
      expect(schema?.items?.type).toBe('string');
    });

    it('should handle Array<UserDto> with proper $ref to UserDto', async () => {
      const spec = await generateSpec();

      const dtoArrayOp = spec.paths?.['/builtin-types/dto-array']?.post;
      expect(dtoArrayOp).toBeDefined();

      const requestBody = dtoArrayOp?.requestBody as {
        content?: { 'application/json'?: { schema?: unknown } };
      };
      const schema = requestBody?.content?.['application/json']?.schema as {
        type?: string;
        items?: { $ref?: string };
        $ref?: string;
      };

      // Should be array type with $ref to UserDto, NOT $ref to "Array"
      expect(schema?.type).toBe('array');
      expect(schema?.items?.$ref).toBe('#/components/schemas/UserDto');
    });

    it('should NOT create a broken $ref to "Record" for Record<string, number>', async () => {
      const spec = await generateSpec();

      const recordOp = spec.paths?.['/builtin-types/record-type']?.post;
      expect(recordOp).toBeDefined();

      const requestBody = recordOp?.requestBody as {
        content?: { 'application/json'?: { schema?: unknown } };
      };
      const schema = requestBody?.content?.['application/json']?.schema as {
        type?: string;
        additionalProperties?: unknown;
        $ref?: string;
      };

      // Should NOT be a $ref to "Record" (which would be broken)
      // It should either be inlined as object or use a valid $ref
      if (schema?.$ref) {
        expect(schema.$ref).not.toBe('#/components/schemas/Record');
      }
    });

    it('should NOT create schemas for built-in types like Array, Record, Map', async () => {
      const spec = await generateSpec();

      // These should NOT appear in schemas
      expect(spec.components?.schemas?.['Array']).toBeUndefined();
      expect(spec.components?.schemas?.['Record']).toBeUndefined();
      expect(spec.components?.schemas?.['Map']).toBeUndefined();
      expect(spec.components?.schemas?.['Partial']).toBeUndefined();
    });
  });
});
