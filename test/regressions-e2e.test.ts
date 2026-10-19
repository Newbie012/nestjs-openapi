import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'path';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { Effect, Logger } from 'effect';
import {
  generateEffect,
  type GenerateResult,
} from '../src/document/generate.js';
import { generatorServicesLayer } from '../src/runtime/service-layer.js';
import type { OpenApiSchema, OpenApiSpec } from '../src/config/types.js';

const fixtureDir = resolve(process.cwd(), 'e2e-applications/regressions');

const generateWithWarnings = async (config: string, output: string) => {
  const warnings: string[] = [];
  const logger = Logger.make(({ logLevel, message }) => {
    if (logLevel._tag === 'Warning') warnings.push(String(message));
  });
  const result = await Effect.runPromise(
    generateEffect(resolve(fixtureDir, config)).pipe(
      Effect.provide(generatorServicesLayer),
      Effect.provide(Logger.replace(Logger.defaultLogger, logger)),
    ) as Effect.Effect<GenerateResult>,
  );
  const outputPath = resolve(fixtureDir, output);
  const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));
  unlinkSync(outputPath);
  return { spec, warnings, brokenRefCount: result.validation.brokenRefCount };
};

describe('Regressions E2E', () => {
  let spec: OpenApiSpec;
  let warnings: string[];
  let brokenRefCount: number;

  beforeAll(async () => {
    ({ spec, warnings, brokenRefCount } = await generateWithWarnings(
      'openapi.config.ts',
      'openapi.generated.json',
    ));
  });

  afterAll(() => {
    const outputPath = resolve(fixtureDir, 'openapi.generated.json');
    if (existsSync(outputPath)) unlinkSync(outputPath);
  });

  const schemaOf = (name: string) => spec.components?.schemas?.[name];
  const propertiesOf = (name: string) =>
    (schemaOf(name)?.properties ?? {}) as Record<string, OpenApiSchema>;

  it('leaves no broken references', () => {
    expect(brokenRefCount).toBe(0);
  });

  describe('a type built on library typings the schema generator cannot index', () => {
    it('keeps a component with the structure TypeScript resolves', () => {
      expect(
        spec.paths['/auth/me']?.get?.responses?.['200']?.content?.[
          'application/json'
        ]?.schema,
      ).toEqual({ $ref: '#/components/schemas/UserProfile' });
      expect(Object.keys(propertiesOf('UserProfile')).sort()).toEqual([
        'address',
        'displayName',
        'email',
        'email_verified',
        'groups',
        'sub',
      ]);
      expect(propertiesOf('UserProfile')['email_verified']).toEqual({
        type: 'boolean',
      });
      expect(schemaOf('UserProfile')?.required).toEqual(
        expect.arrayContaining(['sub', 'displayName', 'groups']),
      );
      expect(warnings.join('\n')).not.toContain('UserProfile');
    });
  });

  describe('enums given by their values', () => {
    it('keeps the component the TypeScript type names', () => {
      const properties = propertiesOf('NotificationSettingsDto');
      expect(properties['channel']).toEqual({
        $ref: '#/components/schemas/NotificationChannel',
      });
      expect(properties['channels']).toEqual({
        type: 'array',
        items: { $ref: '#/components/schemas/NotificationChannel' },
      });
      // 3.0 needs a `type` beside `nullable`: the referenced enum's
      expect(properties['unavailableReason']).toEqual({
        allOf: [{ $ref: '#/components/schemas/ChannelUnavailableReason' }],
        type: 'string',
        nullable: true,
      });
      expect(schemaOf('NotificationChannel')).toEqual({
        type: 'string',
        enum: ['email', 'sms', 'push'],
      });
      expect(schemaOf('ChannelUnavailableReason')).toEqual({
        type: 'string',
        enum: ['not_configured', 'no_permission'],
      });
    });

    it('reads the values of an as-const object', () => {
      expect(propertiesOf('NotificationSettingsDto')['label']).toEqual({
        type: 'string',
        enum: ['email', 'sms', 'push'],
      });
      expect(propertiesOf('UpdateThemeDto')['themeMode']).toEqual({
        $ref: '#/components/schemas/ThemeMode',
      });
      expect(warnings.join('\n')).not.toContain('statically');
    });
  });

  describe('a generic whose declaration collides', () => {
    // Two different FilterOption<T> classes, each used with its own type
    // argument: the instantiations' names already tell them apart
    it('names each instantiation after its type argument', () => {
      const schemas = spec.components?.schemas ?? {};

      expect(propertiesOf('SearchFiltersDto')['dateRange']).toEqual({
        $ref: '#/components/schemas/FilterOption_DateRangeOptions',
      });
      expect(schemas['FilterOption_DateRangeOptions']?.properties).toEqual({
        value: { $ref: '#/components/schemas/DateRangeOptions' },
        label: { type: 'string' },
      });
      expect(schemas['FilterOption_PriorityLevelDto']?.properties).toEqual({
        option: { $ref: '#/components/schemas/PriorityLevelDto' },
        count: { type: 'number' },
      });
    });

    it('names them the same way with raw generic names', async () => {
      const raw = await generateWithWarnings(
        'openapi.raw.config.ts',
        'openapi.raw.generated.json',
      );
      expect(
        Object.keys(raw.spec.components?.schemas ?? {})
          .filter((name) => name.includes('FilterOption'))
          .sort(),
      ).toEqual([
        'FilterOption<DateRangeOptions>',
        'FilterOption<PriorityLevelDto>',
      ]);
      expect(raw.brokenRefCount).toBe(0);
    });
  });

  describe('a validated property whose type allows null', () => {
    it('keeps null when @IsOptional lets it through', () => {
      expect(propertiesOf('PatchNoteDto')['reason']).toEqual({
        type: 'string',
        nullable: true,
        maxLength: 250,
      });
    });

    it('drops null when the validator rejects it', () => {
      expect(propertiesOf('PatchNoteDto')['title']).toEqual({
        type: 'string',
      });
    });

    it('requires only what the validator or the type demands', () => {
      expect(schemaOf('PatchNoteDto')?.required).toEqual(['title', 'summary']);
    });
  });

  describe('entities related through a transparent wrapper alias', () => {
    const checkerId = /(?:structure|class)-\d+/;

    it('refers to each entity directly, without wrapper components', () => {
      const schemas = spec.components?.schemas ?? {};

      expect(propertiesOf('Owner')['pet']).toEqual({
        allOf: [{ $ref: '#/components/schemas/Pet' }],
        nullable: true,
        type: 'object',
      });
      expect(propertiesOf('Owner')['profile']).toEqual({
        $ref: '#/components/schemas/Profile',
      });
      expect(propertiesOf('Profile')['owner']).toEqual({
        $ref: '#/components/schemas/Owner',
      });
      expect(
        Object.keys(schemas).filter((name) => name.startsWith('Relation')),
      ).toEqual([]);
    });

    it('names preserved wrappers after the entity, never a checker ID', async () => {
      const preserved = await generateWithWarnings(
        'openapi.alias-refs.config.ts',
        'openapi.alias-refs.generated.json',
      );
      const names = Object.keys(preserved.spec.components?.schemas ?? {});

      expect(
        names.filter((name) => name.startsWith('Relation')).sort(),
      ).toEqual(['Relation_Owner', 'Relation_Pet', 'Relation_Profile']);
      expect(names.filter((name) => checkerId.test(name))).toEqual([]);
      expect(preserved.brokenRefCount).toBe(0);
    });
  });
});
