import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'path';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { Effect, Logger } from 'effect';
import { generateEffect, type GenerateResult } from '../src/generate.js';
import { generatorServicesLayer } from '../src/service-layer.js';
import type { OpenApiSchema, OpenApiSpec } from '../src/types.js';

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
      expect(properties['unavailableReason']).toEqual({
        allOf: [{ $ref: '#/components/schemas/ChannelUnavailableReason' }],
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
    it('inlines its instantiations', () => {
      expect(
        Object.keys(spec.components?.schemas ?? {}).filter((name) =>
          name.includes('FilterOption'),
        ),
      ).toEqual([]);
      expect(propertiesOf('SearchFiltersDto')['dateRange']).toMatchObject({
        type: 'object',
        properties: {
          value: { $ref: '#/components/schemas/DateRangeOptions' },
        },
      });
    });

    it('inlines them with raw generic names too', async () => {
      const raw = await generateWithWarnings(
        'openapi.raw.config.ts',
        'openapi.raw.generated.json',
      );
      expect(
        Object.keys(raw.spec.components?.schemas ?? {}).filter((name) =>
          name.includes('FilterOption'),
        ),
      ).toEqual([]);
      expect(raw.brokenRefCount).toBe(0);
    });
  });
});
