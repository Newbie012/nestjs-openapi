import { describe, it, expect } from 'vitest';
import {
  adaptSpecForV30,
  transformSchemasForVersion,
  transformSpecForVersion,
} from './schema-version-transformer.js';
import type { OpenApiSchema, OpenApiSpec } from '../config/types.js';

describe('schema-version-transformer', () => {
  describe('transformSchemasForVersion', () => {
    it('should return schemas unchanged for 3.0.3', () => {
      const schemas: Record<string, OpenApiSchema> = {
        User: { type: 'object', properties: { name: { type: 'string' } } },
      };

      const result = transformSchemasForVersion(schemas, '3.0.3');

      expect(result).toEqual(schemas);
    });

    it('should transform nullable for 3.1.0', () => {
      const schemas: Record<string, OpenApiSchema> = {
        User: {
          type: 'object',
          properties: {
            name: { type: 'string', nullable: true },
            email: { type: 'string' },
          },
        },
      };

      const result = transformSchemasForVersion(schemas, '3.1.0');

      expect(result.User.properties?.name.type).toEqual(['string', 'null']);
      expect(result.User.properties?.email.type).toBe('string');
    });

    it('should move metadata beside $ref for 3.1.0', () => {
      const schemas: Record<string, OpenApiSchema> = {
        User: {
          type: 'object',
          properties: {
            role: {
              allOf: [{ $ref: '#/components/schemas/Role' }],
              description: 'User role',
            },
            manager: {
              allOf: [{ $ref: '#/components/schemas/User' }],
              description: 'Manager, if any',
              nullable: true,
            },
          },
        },
      };

      const result = transformSchemasForVersion(schemas, '3.1.0');

      expect(result.User.properties?.role).toEqual({
        $ref: '#/components/schemas/Role',
        description: 'User role',
      });
      expect(result.User.properties?.manager).toEqual({
        anyOf: [{ $ref: '#/components/schemas/User' }, { type: 'null' }],
        description: 'Manager, if any',
      });
    });

    it('should transform nullable for 3.2.0', () => {
      const schemas: Record<string, OpenApiSchema> = {
        Product: {
          type: 'object',
          properties: {
            description: { type: 'string', nullable: true },
          },
        },
      };

      const result = transformSchemasForVersion(schemas, '3.2.0');

      expect(result.Product.properties?.description.type).toEqual([
        'string',
        'null',
      ]);
    });

    it('should transform nested nullable schemas in properties', () => {
      const schemas: Record<string, OpenApiSchema> = {
        User: {
          type: 'object',
          properties: {
            name: { type: 'string', nullable: true },
            age: { type: 'number' },
          },
        },
      };

      const result = transformSchemasForVersion(schemas, '3.1.0');

      expect(result.User.properties?.name.type).toEqual(['string', 'null']);
      expect(result.User.properties?.age.type).toBe('number');
    });

    it('should transform nullable in array items', () => {
      const schemas: Record<string, OpenApiSchema> = {
        UserList: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: { type: 'string', nullable: true },
            },
          },
        },
      };

      const result = transformSchemasForVersion(schemas, '3.1.0');

      expect(
        (result.UserList.properties?.items as OpenApiSchema).items?.type,
      ).toEqual(['string', 'null']);
    });

    it('should keep a nullable $ref wrapper for 3.0.3', () => {
      // ARRANGE
      const schemas: Record<string, OpenApiSchema> = {
        Widget: {
          type: 'object',
          properties: {
            method: {
              allOf: [{ $ref: '#/components/schemas/PaymentMethodDto' }],
              nullable: true,
            },
          },
        },
      };

      // ACT
      const result = transformSchemasForVersion(schemas, '3.0.3');

      // ASSERT
      expect(result.Widget.properties?.['method']).toEqual({
        allOf: [{ $ref: '#/components/schemas/PaymentMethodDto' }],
        nullable: true,
      });
    });

    it.each(['3.1.0', '3.2.0'] as const)(
      'should drop the single-member allOf wrapper around a nullable $ref for %s',
      (version) => {
        // ARRANGE
        const schemas: Record<string, OpenApiSchema> = {
          Widget: {
            type: 'object',
            properties: {
              method: {
                allOf: [{ $ref: '#/components/schemas/PaymentMethodDto' }],
                nullable: true,
              },
            },
          },
        };

        // ACT
        const result = transformSchemasForVersion(schemas, version);

        // ASSERT
        expect(result.Widget.properties?.['method']).toEqual({
          anyOf: [
            { $ref: '#/components/schemas/PaymentMethodDto' },
            { type: 'null' },
          ],
        });
      },
    );

    it.each(['3.0.3', '3.1.0'] as const)(
      'should leave a non-nullable $ref untouched for %s',
      (version) => {
        // ARRANGE
        const schemas: Record<string, OpenApiSchema> = {
          Widget: {
            type: 'object',
            properties: {
              method: { $ref: '#/components/schemas/PaymentMethodDto' },
            },
          },
        };

        // ACT
        const result = transformSchemasForVersion(schemas, version);

        // ASSERT
        expect(result.Widget.properties?.['method']).toEqual({
          $ref: '#/components/schemas/PaymentMethodDto',
        });
      },
    );

    it('should keep a multi-member allOf that is nullable as a wrapped union for 3.1.0', () => {
      // ARRANGE
      const schemas: Record<string, OpenApiSchema> = {
        Widget: {
          allOf: [
            { $ref: '#/components/schemas/PaymentMethodDto' },
            { type: 'object' },
          ],
          nullable: true,
        },
      };

      // ACT
      const result = transformSchemasForVersion(schemas, '3.1.0');

      // ASSERT
      expect(result.Widget).toEqual({
        anyOf: [
          {
            allOf: [
              { $ref: '#/components/schemas/PaymentMethodDto' },
              { type: 'object' },
            ],
          },
          { type: 'null' },
        ],
      });
    });

    it.each(['3.0.3', '3.1.0'] as const)(
      'should leave a nullable non-$ref schema unaffected for %s',
      (version) => {
        // ARRANGE
        const schemas: Record<string, OpenApiSchema> = {
          Widget: {
            type: 'object',
            properties: { label: { type: 'string', nullable: true } },
          },
        };

        // ACT
        const result = transformSchemasForVersion(schemas, version);

        // ASSERT
        expect(result.Widget.properties?.['label']).toEqual(
          version === '3.0.3'
            ? { type: 'string', nullable: true }
            : { type: ['string', 'null'] },
        );
      },
    );

    it.each(['3.1.0', '3.2.0'] as const)(
      'should replace format binary with contentMediaType for %s',
      (version) => {
        // ARRANGE
        const schemas: Record<string, OpenApiSchema> = {
          Widget: {
            type: 'object',
            properties: { file: { type: 'string', format: 'binary' } },
          },
        };

        // ACT
        const result = transformSchemasForVersion(schemas, version);

        // ASSERT
        expect(result.Widget.properties?.['file']).toEqual({
          type: 'string',
          contentMediaType: 'application/octet-stream',
        });
      },
    );

    it.each(['3.1.0', '3.2.0'] as const)(
      'should replace format byte with contentEncoding for %s',
      (version) => {
        // ARRANGE
        const schemas: Record<string, OpenApiSchema> = {
          Widget: {
            type: 'object',
            properties: { payload: { type: 'string', format: 'byte' } },
          },
        };

        // ACT
        const result = transformSchemasForVersion(schemas, version);

        // ASSERT
        expect(result.Widget.properties?.['payload']).toEqual({
          type: 'string',
          contentEncoding: 'base64',
        });
      },
    );

    it('should keep format binary and byte for 3.0.3', () => {
      // ARRANGE
      const schemas: Record<string, OpenApiSchema> = {
        Widget: {
          type: 'object',
          properties: {
            file: { type: 'string', format: 'binary' },
            payload: { type: 'string', format: 'byte' },
          },
        },
      };

      // ACT
      const result = transformSchemasForVersion(schemas, '3.0.3');

      // ASSERT
      expect(result.Widget.properties?.['file']).toEqual({
        type: 'string',
        format: 'binary',
      });
      expect(result.Widget.properties?.['payload']).toEqual({
        type: 'string',
        format: 'byte',
      });
    });

    it('should keep every other format for 3.1.0', () => {
      // ARRANGE
      const schemas: Record<string, OpenApiSchema> = {
        Widget: {
          type: 'object',
          properties: { createdAt: { type: 'string', format: 'date-time' } },
        },
      };

      // ACT
      const result = transformSchemasForVersion(schemas, '3.1.0');

      // ASSERT
      expect(result.Widget.properties?.['createdAt']).toEqual({
        type: 'string',
        format: 'date-time',
      });
    });

    it('should replace format binary on a nullable property for 3.1.0', () => {
      // ARRANGE
      const schemas: Record<string, OpenApiSchema> = {
        Widget: {
          type: 'object',
          properties: {
            file: { type: 'string', format: 'binary', nullable: true },
          },
        },
      };

      // ACT
      const result = transformSchemasForVersion(schemas, '3.1.0');

      // ASSERT
      expect(result.Widget.properties?.['file']).toEqual({
        type: ['string', 'null'],
        contentMediaType: 'application/octet-stream',
      });
    });

    it('should transform nullable in oneOf', () => {
      const schemas: Record<string, OpenApiSchema> = {
        Response: {
          oneOf: [{ type: 'string', nullable: true }, { type: 'number' }],
        },
      };

      const result = transformSchemasForVersion(schemas, '3.1.0');

      expect(result.Response.oneOf?.[0].type).toEqual(['string', 'null']);
      expect(result.Response.oneOf?.[1].type).toBe('number');
    });
  });

  describe('transformSpecForVersion', () => {
    it('should return spec unchanged for 3.0.3', () => {
      const spec: OpenApiSpec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {},
      };

      const result = transformSpecForVersion(spec, '3.0.3');

      expect(result.openapi).toBe('3.0.3');
    });

    it('should update version and transform schemas for 3.1.0', () => {
      const spec: OpenApiSpec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            User: {
              type: 'object',
              properties: {
                nickname: { type: 'string', nullable: true },
              },
            },
          },
        },
      };

      const result = transformSpecForVersion(spec, '3.1.0');

      expect(result.openapi).toBe('3.1.0');
      expect(
        result.components?.schemas?.User.properties?.nickname.type,
      ).toEqual(['string', 'null']);
    });

    it('should handle specs without schemas', () => {
      const spec: OpenApiSpec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {},
      };

      const result = transformSpecForVersion(spec, '3.1.0');

      expect(result.openapi).toBe('3.1.0');
      expect(result.components).toBeUndefined();
    });

    it('should transform nullable in path parameter schemas for 3.1.0', () => {
      const spec: OpenApiSpec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              parameters: [
                {
                  name: 'search',
                  in: 'query',
                  required: false,
                  schema: { type: 'string', nullable: true },
                },
              ],
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      };

      const result = transformSpecForVersion(spec, '3.1.0');

      const param = result.paths['/users'].get.parameters?.[0];
      expect(param?.schema?.type).toEqual(['string', 'null']);
    });

    it('should transform nullable in response schemas for 3.1.0', () => {
      const spec: OpenApiSpec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              responses: {
                '200': {
                  description: 'OK',
                  content: {
                    'application/json': {
                      schema: { type: 'number', nullable: true },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const result = transformSpecForVersion(spec, '3.1.0');

      const schema =
        result.paths['/users'].get.responses['200']?.content?.[
          'application/json'
        ]?.schema;
      expect(schema?.type).toEqual(['number', 'null']);
    });

    it('should preserve nullability for allOf-wrapped refs in path schemas', () => {
      const spec: OpenApiSpec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users/{id}': {
            get: {
              operationId: 'getUser',
              responses: {
                '200': {
                  description: 'OK',
                  content: {
                    'application/json': {
                      schema: {
                        allOf: [{ $ref: '#/components/schemas/UserDto' }],
                        nullable: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const result = transformSpecForVersion(spec, '3.1.0');

      const schema =
        result.paths['/users/{id}'].get.responses['200']?.content?.[
          'application/json'
        ]?.schema;

      expect(schema).toEqual({
        anyOf: [{ $ref: '#/components/schemas/UserDto' }, { type: 'null' }],
      });
    });

    it('should preserve nullability for oneOf path schemas', () => {
      const spec: OpenApiSpec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              parameters: [
                {
                  name: 'filter',
                  in: 'query',
                  required: false,
                  schema: {
                    oneOf: [{ type: 'string' }, { type: 'number' }],
                    nullable: true,
                  },
                },
              ],
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      };

      const result = transformSpecForVersion(spec, '3.1.0');

      const schema = result.paths['/users'].get.parameters?.[0]?.schema;
      expect(schema).toEqual({
        oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'null' }],
      });
    });

    it('should transform nullable in request body schemas for 3.1.0', () => {
      const spec: OpenApiSpec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        bio: { type: 'string', nullable: true },
                      },
                    },
                  },
                },
              },
              responses: { '201': { description: 'Created' } },
            },
          },
        },
      };

      const result = transformSpecForVersion(spec, '3.1.0');

      const schema =
        result.paths['/users'].post.requestBody?.content?.['application/json']
          ?.schema;
      expect(schema?.properties?.bio?.type).toEqual(['string', 'null']);
    });

    it('should leave path schemas untouched for 3.0.3', () => {
      const spec: OpenApiSpec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              parameters: [
                {
                  name: 'search',
                  in: 'query',
                  required: false,
                  schema: { type: 'string', nullable: true },
                },
              ],
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      };

      const result = transformSpecForVersion(spec, '3.0.3');

      const param = result.paths['/users'].get.parameters?.[0];
      expect(param?.schema).toEqual({ type: 'string', nullable: true });
    });

    it('should transform nullable number for 3.1.0', () => {
      const spec: OpenApiSpec = {
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            Product: {
              type: 'object',
              properties: {
                price: { type: 'number', nullable: true },
              },
            },
          },
        },
      };

      const result = transformSpecForVersion(spec, '3.1.0');

      expect(
        result.components?.schemas?.Product.properties?.price.type,
      ).toEqual(['number', 'null']);
    });
  });

  describe('binary bodies', () => {
    const specWithBody = (contentType: string): OpenApiSpec => ({
      openapi: '3.0.3',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/files': {
          get: {
            operationId: 'download',
            responses: {
              '200': {
                description: 'The file',
                content: {
                  [contentType]: {
                    schema: { type: 'string', format: 'binary' },
                  },
                },
              },
            },
          },
        },
      },
    });

    const bodySchema = (contentType: string) =>
      transformSpecForVersion(specWithBody(contentType), '3.1.0').paths[
        '/files'
      ]?.get?.responses['200']?.content?.[contentType]?.schema;

    it('states the media type of bytes sent as the whole body for 3.1', () => {
      expect(bodySchema('application/pdf')).toEqual({
        type: 'string',
        contentMediaType: 'application/pdf',
      });
    });

    it.each(['application/json', '*/*', 'image/*'])(
      'keeps application/octet-stream under %s',
      (contentType) => {
        expect(bodySchema(contentType)).toEqual({
          type: 'string',
          contentMediaType: 'application/octet-stream',
        });
      },
    );
  });

  describe('adaptSpecForV30', () => {
    const adaptProperty = (
      property: OpenApiSchema,
      schemas: Record<string, OpenApiSchema> = {},
    ) =>
      adaptSpecForV30({
        openapi: '3.0.3',
        info: { title: 'Pets', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            ...schemas,
            Pet: { type: 'object', properties: { value: property } },
          },
        },
      }).components?.schemas?.['Pet']?.properties?.['value'];

    it('gives a nullable reference the type of what it references', () => {
      const schemas: Record<string, OpenApiSchema> = {
        Owner: { type: 'object', properties: { name: { type: 'string' } } },
        Species: { type: 'string', enum: ['cat', 'dog'] },
      };

      expect(
        adaptProperty(
          { $ref: '#/components/schemas/Owner', nullable: true },
          schemas,
        ),
      ).toEqual({
        allOf: [{ $ref: '#/components/schemas/Owner' }],
        type: 'object',
        nullable: true,
      });
      expect(
        adaptProperty(
          {
            allOf: [{ $ref: '#/components/schemas/Species' }],
            description: 'The species',
            nullable: true,
          },
          schemas,
        ),
      ).toEqual({
        allOf: [{ $ref: '#/components/schemas/Species' }],
        description: 'The species',
        type: 'string',
        nullable: true,
      });
    });

    it('allows null through an anyOf member when no single type fits', () => {
      expect(
        adaptProperty({
          oneOf: [{ type: 'string' }, { type: 'number' }],
          description: 'A label or a rank',
          nullable: true,
        }),
      ).toEqual({
        description: 'A label or a rank',
        anyOf: [
          { oneOf: [{ type: 'string' }, { type: 'number' }] },
          { type: 'object', nullable: true, enum: [null] },
        ],
      });
    });

    it('writes const as a single-value enum, in operations too', () => {
      const spec = adaptSpecForV30({
        openapi: '3.0.3',
        info: { title: 'Pets', version: '1.0.0' },
        paths: {
          '/pets': {
            get: {
              operationId: 'listPets',
              responses: {
                '200': {
                  description: 'The pets',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          status: {
                            type: 'string',
                            const: 'ok',
                          } as OpenApiSchema,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      expect(
        spec.paths['/pets']?.get?.responses['200']?.content?.[
          'application/json'
        ]?.schema?.properties?.['status'],
      ).toEqual({ type: 'string', enum: ['ok'] });
    });

    it('leaves a typed nullable as it is', () => {
      expect(adaptProperty({ type: 'string', nullable: true })).toEqual({
        type: 'string',
        nullable: true,
      });
    });

    it('also adapts the schemas of operations', () => {
      const spec = adaptSpecForV30({
        openapi: '3.0.3',
        info: { title: 'Pets', version: '1.0.0' },
        paths: {
          '/pets': {
            get: {
              operationId: 'listPets',
              responses: {
                '200': {
                  description: 'The pets',
                  content: {
                    'application/json': {
                      schema: {
                        $ref: '#/components/schemas/Page',
                        nullable: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        components: { schemas: { Page: { type: 'object' } } },
      });

      expect(
        spec.paths['/pets']?.get?.responses['200']?.content?.[
          'application/json'
        ]?.schema,
      ).toEqual({
        allOf: [{ $ref: '#/components/schemas/Page' }],
        type: 'object',
        nullable: true,
      });
    });

    it('writes a numeric exclusive bound as a boolean beside its bound', () => {
      expect(
        adaptProperty({ type: 'number', exclusiveMinimum: 0, maximum: 10 }),
      ).toEqual({
        type: 'number',
        minimum: 0,
        exclusiveMinimum: true,
        maximum: 10,
      });
      // `minimum: 5` is already stricter than `> 0`
      expect(
        adaptProperty({ type: 'number', minimum: 5, exclusiveMinimum: 0 }),
      ).toEqual({ type: 'number', minimum: 5 });
    });
  });

  describe('exclusive bounds for 3.1', () => {
    it('writes a boolean exclusive bound as the bound itself', () => {
      const spec = transformSpecForVersion(
        {
          openapi: '3.0.3',
          info: { title: 'Pets', version: '1.0.0' },
          paths: {},
          components: {
            schemas: {
              Pet: {
                type: 'object',
                properties: {
                  age: {
                    type: 'number',
                    minimum: 0,
                    exclusiveMinimum: true,
                  },
                  weight: {
                    type: 'number',
                    maximum: 90,
                    exclusiveMaximum: false,
                  },
                },
              },
            },
          },
        },
        '3.1.0',
      );

      expect(spec.components?.schemas?.['Pet']?.properties).toEqual({
        age: { type: 'number', exclusiveMinimum: 0 },
        weight: { type: 'number', maximum: 90 },
      });
    });
  });

  describe('subschemas under every keyword for 3.1', () => {
    const nullableString: OpenApiSchema = { type: 'string', nullable: true };
    const nullableTypeArray = { type: ['string', 'null'] };

    it.each(['3.1.0', '3.2.0'] as const)(
      'transforms nullable under additionalProperties, not and patternProperties for %s',
      (version) => {
        const result = transformSchemasForVersion(
          {
            Map: { type: 'object', additionalProperties: nullableString },
            Negated: { not: nullableString },
            Patterned: {
              type: 'object',
              patternProperties: { '^x-': nullableString },
            },
          } as Record<string, OpenApiSchema>,
          version,
        );

        expect(result['Map']).toEqual({
          type: 'object',
          additionalProperties: nullableTypeArray,
        });
        expect(result['Negated']).toEqual({ not: nullableTypeArray });
        expect(result['Patterned']).toEqual({
          type: 'object',
          patternProperties: { '^x-': nullableTypeArray },
        });
      },
    );

    it.each([
      ['query', (operation: object) => ({ query: operation })],
      [
        'additionalOperations',
        (operation: object) => ({ additionalOperations: { COPY: operation } }),
      ],
    ])('transforms an operation under %s', (_name, pathItem) => {
      const operation = {
        responses: {
          '200': {
            description: 'ok',
            content: { 'application/json': { schema: nullableString } },
          },
        },
      };

      const spec = transformSpecForVersion(
        {
          openapi: '3.0.3',
          info: { title: 'Pets', version: '1.0.0' },
          paths: { '/pets': pathItem(operation) },
        } as unknown as OpenApiSpec,
        '3.2.0',
      );

      expect(JSON.stringify(spec.paths)).toContain('["string","null"]');
      expect(JSON.stringify(spec.paths)).not.toContain('nullable');
    });
  });

  describe('adaptSpecForV30 const', () => {
    const specWith = (schema: Record<string, unknown>): OpenApiSpec => ({
      openapi: '3.0.3',
      info: { title: 'Pets', version: '1.0.0' },
      paths: {},
      components: { schemas: { Widget: schema as OpenApiSchema } },
    });
    const widgetOf = (spec: OpenApiSpec) =>
      spec.components?.schemas?.['Widget'];

    it('rewrites const as a single-value enum and keeps other keywords', () => {
      const widget = widgetOf(
        adaptSpecForV30(
          specWith({ const: 'pod', type: 'string', description: 'The field' }),
        ),
      );

      expect(widget).toEqual({
        enum: ['pod'],
        type: 'string',
        description: 'The field',
      });
    });

    it('lets an existing enum win over const', () => {
      const widget = widgetOf(
        adaptSpecForV30(
          specWith({ const: 'a', enum: ['a', 'b'], type: 'string' }),
        ),
      );

      expect(widget).toEqual({ enum: ['a', 'b'], type: 'string' });
    });

    it.each([
      ['a falsy string', '', ['']],
      ['zero', 0, [0]],
      ['false', false, [false]],
      ['null', null, [null]],
    ])('expands %s rather than treating it as absent', (_, value, want) => {
      const widget = widgetOf(adaptSpecForV30(specWith({ const: value })));

      expect(widget?.enum).toEqual(want);
    });

    it('rewrites const nested in properties, items, anyOf and additionalProperties', () => {
      const leaf = { const: 'x', type: 'string' };
      const widget = widgetOf(
        adaptSpecForV30(
          specWith({
            type: 'object',
            properties: { kind: leaf, list: { type: 'array', items: leaf } },
            anyOf: [leaf, { type: 'number' }],
            additionalProperties: leaf,
          }),
        ),
      );

      const expanded = { enum: ['x'], type: 'string' };
      expect(widget).toEqual({
        type: 'object',
        properties: {
          kind: expanded,
          list: { type: 'array', items: expanded },
        },
        anyOf: [expanded, { type: 'number' }],
        additionalProperties: expanded,
      });
    });

    it('rewrites const in an operation schema', () => {
      const spec = adaptSpecForV30({
        ...specWith({}),
        paths: {
          '/widgets': {
            get: {
              operationId: 'getWidgets',
              responses: {
                '200': {
                  description: 'OK',
                  content: {
                    'application/json': {
                      schema: {
                        const: 'card',
                        type: 'string',
                      } as OpenApiSchema,
                    },
                  },
                },
              },
            },
          },
        },
      });

      expect(
        spec.paths['/widgets'].get.responses['200'].content?.[
          'application/json'
        ].schema,
      ).toEqual({ enum: ['card'], type: 'string' });
    });

    it.each(['3.1.0', '3.2.0'] as const)('keeps const for %s', (version) => {
      const widget = widgetOf(
        transformSpecForVersion(
          specWith({ const: 'card', type: 'string' }),
          version,
        ),
      );

      expect(widget).toEqual({ const: 'card', type: 'string' });
    });
  });
  describe('primitive unions', () => {
    const specWith = (schema: Record<string, unknown>): OpenApiSpec => ({
      openapi: '3.0.3',
      info: { title: 'Pets', version: '1.0.0' },
      paths: {},
      components: { schemas: { Widget: schema as OpenApiSchema } },
    });
    const widgetOf = (spec: OpenApiSpec) =>
      spec.components?.schemas?.['Widget'];

    it('writes a type list as anyOf for 3.0', () => {
      expect(
        widgetOf(adaptSpecForV30(specWith({ type: ['string', 'number'] }))),
      ).toEqual({ anyOf: [{ type: 'string' }, { type: 'number' }] });
    });

    it('adds the 3.0 null member when the list has null', () => {
      expect(
        widgetOf(
          adaptSpecForV30(specWith({ type: ['string', 'number', 'null'] })),
        ),
      ).toEqual({
        anyOf: [
          { type: 'string' },
          { type: 'number' },
          { type: 'object', nullable: true, enum: [null] },
        ],
      });
    });

    it('keeps other keywords beside anyOf', () => {
      expect(
        widgetOf(
          adaptSpecForV30(
            specWith({ type: ['string', 'number'], description: 'd' }),
          ),
        ),
      ).toEqual({
        description: 'd',
        anyOf: [{ type: 'string' }, { type: 'number' }],
      });
    });

    it('turns a type list with one type and null into nullable', () => {
      expect(
        widgetOf(adaptSpecForV30(specWith({ type: ['string', 'null'] }))),
      ).toEqual({ type: 'string', nullable: true });
    });

    it.each(['3.1.0', '3.2.0'] as const)(
      'leaves a type list alone for %s',
      (version) => {
        expect(
          widgetOf(
            transformSpecForVersion(
              specWith({ type: ['string', 'number'] }),
              version,
            ),
          ),
        ).toEqual({ type: ['string', 'number'] });
      },
    );
  });
});
