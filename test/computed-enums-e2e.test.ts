import { describe, it, expect, afterAll } from 'vitest';
import { resolve } from 'path';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { Effect, Logger } from 'effect';
import { generateEffect } from '../src/generate.js';
import { generatorServicesLayer } from '../src/service-layer.js';
import type { OpenApiSpec } from '../src/types.js';

/**
 * Enum values computed with a pure expression are evaluated like the
 * runtime; values that cannot be read statically are reported.
 */
describe('Computed enums E2E', () => {
  const fixtureDir = resolve(process.cwd(), 'e2e-applications/computed-enums');
  const outputPath = resolve(fixtureDir, 'openapi.generated.json');
  const warnings: string[] = [];
  let spec: OpenApiSpec;

  afterAll(() => {
    if (existsSync(outputPath)) unlinkSync(outputPath);
  });

  const run = async () => {
    if (spec) return spec;
    const logger = Logger.make(({ logLevel, message }) => {
      if (logLevel._tag === 'Warning') warnings.push(String(message));
    });
    await Effect.runPromise(
      generateEffect(resolve(fixtureDir, 'openapi.config.ts')).pipe(
        Effect.provide(generatorServicesLayer),
        Effect.provide(Logger.replace(Logger.defaultLogger, logger)),
      ) as Effect.Effect<unknown>,
    );
    spec = JSON.parse(readFileSync(outputPath, 'utf-8'));
    return spec;
  };

  it('evaluates Object.values(Enum).filter(...) like the runtime', async () => {
    const properties = (await run()).components?.schemas?.['CheckoutDto']
      ?.properties;

    expect(properties?.['paymentMethod']).toEqual({
      type: 'string',
      enum: ['card', 'paypal', 'bank_transfer'],
      description: 'Payment method',
    });
  });

  it('warns about an enum it cannot read, naming the property and location', async () => {
    await run();

    const warning = warnings.find((message) =>
      message.includes('CheckoutDto.region'),
    );
    expect(warning).toMatch(
      /CheckoutDto\.region: @ApiProperty\(\{ enum \}\) cannot read `loadAllowedRegions\(\)` statically \(.*checkout\.dto\.ts:\d+\)/,
    );
  });
});
