import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'path';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { generate } from '../src/document/generate.js';
import type { OpenApiSpec } from '../src/config/types.js';

/**
 * Built-in @nestjs/swagger decorators should produce what @nestjs/swagger
 * produces, whether written directly, through an applyDecorators() wrapper,
 * or through a `decorators` config mapping.
 */
describe('Swagger fidelity E2E', () => {
  const configPath = resolve(
    process.cwd(),
    'e2e-applications/swagger-fidelity/openapi.config.ts',
  );
  const outputPath = resolve(
    process.cwd(),
    'e2e-applications/swagger-fidelity/openapi.generated.json',
  );

  let result: Awaited<ReturnType<typeof generate>>;
  let spec: OpenApiSpec;

  beforeAll(async () => {
    result = await generate(configPath);
    spec = JSON.parse(readFileSync(outputPath, 'utf-8'));
  });

  afterAll(() => {
    if (existsSync(outputPath)) {
      unlinkSync(outputPath);
    }
  });

  const responsesOf = (path: string, method: 'get' | 'post') =>
    spec.paths[path]?.[method]?.responses ?? {};

  const jsonSchemaOf = (
    response: { content?: Record<string, { schema: unknown }> } | undefined,
  ) => response?.content?.['application/json']?.schema;

  it('generates a valid spec', () => {
    expect(result.validation.brokenRefs).toEqual([]);
  });

  describe('response decorators', () => {
    it('reads status shortcuts such as @ApiOkResponse and @ApiNotFoundResponse', () => {
      const responses = responsesOf('/items/report', 'get');

      expect(responses['200']?.description).toBe('The report');
      expect(responses['404']).toEqual({ description: 'No such item' });
    });

    it('lets the declared type win over the inferred return type', () => {
      expect(jsonSchemaOf(responsesOf('/items/report', 'get')['200'])).toEqual({
        $ref: '#/components/schemas/ReportDto',
      });
    });

    it('applies controller-level responses to every method', () => {
      expect(responsesOf('/items/purge', 'post')).toEqual({
        '204': { description: 'Purged' },
        '401': { description: 'Missing credentials' },
        '403': { description: 'Forbidden' },
      });
    });

    it('lets a method-level response override the controller-level one', () => {
      expect(responsesOf('/items', 'post')['401']).toEqual({
        description: 'Token expired',
      });
    });

    it('reads array types, HttpStatus constants and @ApiDefaultResponse', () => {
      const responses = responsesOf('/items/search', 'post');

      expect(jsonSchemaOf(responses['200'])).toEqual({
        type: 'array',
        items: { $ref: '#/components/schemas/ItemDto' },
      });
      expect(responses['default']?.description).toBe('Unexpected error');
      expect(jsonSchemaOf(responses['default'])).toEqual({
        $ref: '#/components/schemas/ErrorDto',
      });
    });

    it('reads an explicit schema with getSchemaPath()', () => {
      expect(jsonSchemaOf(responsesOf('/items/schema', 'get')['200'])).toEqual({
        type: 'array',
        items: { $ref: '#/components/schemas/ItemDto' },
      });
    });
  });

  describe('@ApiBody', () => {
    it('documents the declared body type and description', () => {
      expect(spec.paths['/items']?.post?.requestBody).toEqual({
        description: 'What to create',
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateItemDto' },
          },
        },
      });
    });
  });

  describe('applyDecorators() wrappers', () => {
    it('expands a controller wrapper into path, tags and security', () => {
      const operation = spec.paths['/external']?.get;

      expect(operation?.tags).toEqual(['External']);
      expect(operation?.security).toEqual([{ bearer: [] }]);
    });

    it('expands a method wrapper into its responses', () => {
      const responses = responsesOf('/external', 'get');

      expect(responses['400']?.description).toBe('Bad request');
      expect(responses['401']).toEqual({ description: 'Unauthorized' });
    });

    it('expands property wrappers, including default and destructured arguments', () => {
      const searchDto = spec.components?.schemas?.['SearchDto'];

      expect(searchDto?.required ?? []).toEqual([]);
      expect(searchDto?.properties?.['text']).toEqual({
        type: 'string',
        description: 'Free text',
      });
    });

    it('excludes endpoints hidden through a wrapper constant', () => {
      expect(spec.paths['/items/internal']).toBeUndefined();
    });
  });

  describe('classes outside dtoGlob', () => {
    it('honours decorators on a class returned by a controller', () => {
      const schema = spec.components?.schemas?.['ExternalLibraryDto'];

      expect(schema?.required).toEqual(['name']);
      expect(schema?.properties?.['name']?.description).toBe('Library name');
    });

    it('honours decorators on a class nested in a DTO', () => {
      const schema = spec.components?.schemas?.['ExternalLibraryRefDto'];

      expect(schema?.required ?? []).toEqual([]);
      expect(schema?.properties?.['source']?.description).toBe(
        'Where it came from',
      );
    });
  });

  describe('descriptions on references', () => {
    it('wraps a described $ref in allOf, as @nestjs/swagger does for 3.0', () => {
      const properties =
        spec.components?.schemas?.['LibraryUsageDto']?.properties ?? {};

      expect(properties['ref']).toEqual({
        allOf: [{ $ref: '#/components/schemas/ExternalLibraryRefDto' }],
        description: 'The library reference',
      });
      expect(properties['previous']).toEqual({
        allOf: [{ $ref: '#/components/schemas/ExternalLibraryRefDto' }],
        description: 'Previous reference',
        nullable: true,
      });
    });
  });

  describe('class declarations', () => {
    const schemaOf = (name: string) => spec.components?.schemas?.[name];

    it('generates a non-exported response class declared next to the controller', () => {
      expect(jsonSchemaOf(responsesOf('/people', 'get')['200'])).toEqual({
        $ref: '#/components/schemas/PersonListResponse',
      });
      expect(
        Object.keys(schemaOf('PersonListResponse')?.properties ?? {}),
      ).toEqual(['items', 'total']);
    });

    it('references a non-exported nested class', () => {
      expect(schemaOf('PersonDto')?.properties?.['badge']).toEqual({
        $ref: '#/components/schemas/Badge',
      });
      expect(schemaOf('Badge')?.required).toEqual(['label']);
    });
  });

  describe('mapped types', () => {
    const schemaOf = (name: string) => spec.components?.schemas?.[name];
    const propertyNames = (name: string) =>
      Object.keys(schemaOf(name)?.properties ?? {}).sort();

    it('PartialType keeps every property and makes them optional', () => {
      expect(propertyNames('UpdatePersonDto')).toEqual([
        'badge',
        'id',
        'name',
        'nickname',
      ]);
      expect(schemaOf('UpdatePersonDto')?.required).toBeUndefined();
    });

    it('PickType keeps only the picked properties', () => {
      expect(propertyNames('PersonNameDto')).toEqual(['name']);
      expect(schemaOf('PersonNameDto')?.required).toEqual(['name']);
    });

    it('OmitType drops the omitted properties and keeps own ones', () => {
      expect(propertyNames('CreatePersonDto')).toEqual([
        'badge',
        'inviteCode',
        'name',
        'nickname',
      ]);
      expect([...(schemaOf('CreatePersonDto')?.required ?? [])].sort()).toEqual(
        ['badge', 'inviteCode', 'name'],
      );
    });

    it('composes nested helpers', () => {
      expect(propertyNames('PatchPersonDto')).toEqual([
        'badge',
        'name',
        'nickname',
      ]);
      expect(schemaOf('PatchPersonDto')?.required).toBeUndefined();
    });

    it('IntersectionType merges both classes with their metadata', () => {
      expect(propertyNames('AddressContactDto')).toEqual(['email', 'street']);
      expect(
        schemaOf('AddressContactDto')?.properties?.['email']?.description,
      ).toBe('Contact email');
    });
  });

  describe('static evaluation of decorator arguments', () => {
    it('evaluates concatenation and template literals', () => {
      const operation = spec.paths['/people/properties']?.get;

      expect(operation?.summary).toBe('Property options');
      expect(operation?.description).toBe(
        'Every @ApiProperty option, with Nest precedence',
      );
    });
  });

  describe('@ApiProperty options', () => {
    const property = (name: string) =>
      spec.components?.schemas?.['PropertyOptionsDto']?.properties?.[name];

    it('lets a declared class replace a non-class TypeScript type', () => {
      expect(property('address')).toEqual({
        $ref: '#/components/schemas/Address',
      });
      expect(property('payload')).toEqual({
        $ref: '#/components/schemas/DecoratorOnlyDto',
      });
      expect(property('payloads')).toEqual({
        type: 'array',
        items: { $ref: '#/components/schemas/DecoratorOnlyDto' },
      });
    });

    it('generates a class that only a decorator names', () => {
      expect(
        spec.components?.schemas?.['DecoratorOnlyDto']?.properties,
      ).toEqual({
        value: { type: 'string', description: 'Only named by decorators' },
      });
    });

    it('lets a declared primitive type win', () => {
      expect(property('rating')).toEqual({
        type: 'integer',
        minimum: 1,
        maximum: 10,
      });
      expect(property('numericString')).toEqual({ type: 'number' });
    });

    it('copies schema keywords', () => {
      expect(property('id')).toEqual({
        type: 'string',
        format: 'uuid',
        pattern: '^[a-f0-9-]+$',
      });
      expect(property('name')).toEqual({
        type: 'string',
        minLength: 2,
        maxLength: 40,
        title: 'Name',
        default: 'anonymous',
        example: 'Ada',
      });
      expect(property('tags')).toEqual({
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 5,
        uniqueItems: true,
      });
      expect(property('legacyId')).toEqual({
        type: 'string',
        readOnly: true,
        deprecated: true,
      });
      expect(property('password')).toEqual({ type: 'string', writeOnly: true });
      expect(property('maybe')).toEqual({
        type: 'number',
        nullable: true,
        description: 'Maybe a number',
      });
    });

    it('reads additionalProperties, items, oneOf and discriminator', () => {
      expect(property('labels')).toEqual({
        type: 'object',
        additionalProperties: { type: 'string' },
      });
      expect(property('emails')).toEqual({
        type: 'array',
        items: { type: 'string', format: 'email' },
      });
      expect(property('pet')).toEqual({
        oneOf: [
          { $ref: '#/components/schemas/CatDto' },
          { $ref: '#/components/schemas/DogDto' },
        ],
        discriminator: {
          propertyName: 'kind',
          mapping: {
            cat: '#/components/schemas/CatDto',
            dog: '#/components/schemas/DogDto',
          },
        },
      });
    });
  });

  describe("enums ('nest' style)", () => {
    const property = (name: string) =>
      spec.components?.schemas?.['PropertyOptionsDto']?.properties?.[name];

    it('inlines enum values without enumName', () => {
      expect(property('priority')).toEqual({
        type: 'string',
        enum: ['low', 'high'],
      });
      expect(property('level')).toEqual({ type: 'number', enum: [1, 2] });
      expect(property('order')).toEqual({
        type: 'string',
        enum: ['asc', 'desc'],
      });
    });

    it('inlines an enum inferred from the TypeScript type', () => {
      expect(property('plainPriority')).toEqual({
        type: 'string',
        enum: ['low', 'high'],
      });
    });

    it('emits a named component for enumName', () => {
      expect(property('priorities')).toEqual({
        type: 'array',
        items: { $ref: '#/components/schemas/Priority' },
      });
      expect(spec.components?.schemas?.['Priority']).toEqual({
        type: 'string',
        enum: ['low', 'high'],
      });
    });
  });

  describe('parameter decorators', () => {
    const parameters = (path: string) =>
      spec.paths[path]?.get?.parameters ?? [];
    const parameter = (path: string, name: string) =>
      parameters(path).find((candidate) => candidate.name === name);
    const detail = '/params/{imageBuildId}';

    it('merges @ApiParam over the inferred path parameter', () => {
      expect(parameter(detail, 'imageBuildId')).toEqual({
        name: 'imageBuildId',
        in: 'path',
        required: true,
        description: 'Image build id',
        schema: { type: 'string', format: 'uuid', example: 'build-1' },
      });
    });

    it('reads @ApiQuery type, required, description and schema keywords', () => {
      expect(parameter(detail, 'limit')).toEqual({
        name: 'limit',
        in: 'query',
        required: false,
        description: 'Max items',
        schema: { type: 'number', example: 50, minimum: 1, default: 10 },
      });
    });

    it('adds declared parameters missing from the method signature', () => {
      expect(parameter(detail, 'priority')).toEqual({
        name: 'priority',
        in: 'query',
        required: false,
        schema: { type: 'string', enum: ['low', 'high'] },
      });
      expect(parameter(detail, 'levels')?.schema).toEqual({
        type: 'array',
        items: { $ref: '#/components/schemas/Priority' },
      });
    });

    it('keeps parameter-level fields and puts item modifiers on array items', () => {
      expect(parameter(detail, 'ids')).toEqual({
        name: 'ids',
        in: 'query',
        required: true,
        deprecated: true,
        allowEmptyValue: true,
        style: 'form',
        explode: false,
        schema: { type: 'array', items: { type: 'string', format: 'uuid' } },
      });
      expect(parameter(detail, 'filter')).toEqual({
        name: 'filter',
        in: 'query',
        required: false,
        examples: { one: { value: { a: 'x' } } },
        schema: { type: 'object', properties: { a: { type: 'string' } } },
      });
    });

    it('expands @ApiQuery({ type: Dto }) into the DTO properties', () => {
      expect(parameter(detail, 'q')).toEqual({
        name: 'q',
        in: 'query',
        required: false,
        description: 'Free text search',
        schema: { type: 'string', example: 'nginx' },
      });
    });

    it('reads @ApiHeaders and controller-level @ApiHeader', () => {
      expect(parameter(detail, 'x-request-id')).toEqual({
        name: 'x-request-id',
        in: 'header',
        required: false,
        description: 'Request id',
        schema: { type: 'string' },
      });
      expect(parameter(detail, 'x-trace')?.required).toBe(true);
      expect(parameter('/params', 'x-workspace')).toEqual({
        name: 'x-workspace',
        in: 'header',
        required: true,
        description: 'Workspace id',
        schema: { type: 'string' },
      });
    });

    it('reads @ApiProperty metadata on query DTO properties', () => {
      expect(parameter('/params', 'limit')).toEqual({
        name: 'limit',
        in: 'query',
        required: false,
        description: 'Page size',
        schema: { type: 'number', example: 20, minimum: 1 },
      });
      expect(parameter('/params', 'sortBy')?.schema).toEqual({
        type: 'string',
        enum: ['name', 'createdAt'],
      });
    });
  });

  describe('decorators config option', () => {
    it('maps a property decorator that cannot be followed', () => {
      expect(
        spec.components?.schemas?.['SearchDto']?.required ?? [],
      ).not.toContain('page');
    });

    it('maps a method decorator to a fixed list', () => {
      expect(spec.paths['/items/lib-hidden']).toBeUndefined();
    });

    it('maps a method decorator through a function of its arguments', () => {
      expect(jsonSchemaOf(responsesOf('/items/paged', 'get')['200'])).toEqual({
        type: 'array',
        items: { $ref: '#/components/schemas/ReportDto' },
      });
    });
  });
});
