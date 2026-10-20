import { describe, it, expect, afterAll } from 'vitest';
import { resolve } from 'path';
import { existsSync, unlinkSync } from 'fs';
import { Effect, Logger } from 'effect';
import { generateEffect } from '../src/document/generate.js';
import { generatorServicesLayer } from '../src/runtime/service-layer.js';

/**
 * Values that cannot be read statically are reported. The values that can be
 * read are pinned by the computed-enums contract.
 */
describe('Computed enums E2E', () => {
  const fixtureDir = resolve(process.cwd(), 'e2e-applications/computed-enums');
  const outputPath = resolve(fixtureDir, 'openapi.generated.json');
  const warnings: string[] = [];
  let ran = false;

  afterAll(() => {
    if (existsSync(outputPath)) unlinkSync(outputPath);
  });

  const run = async () => {
    if (ran) return;
    ran = true;
    const logger = Logger.make(({ logLevel, message }) => {
      if (logLevel._tag === 'Warning') warnings.push(String(message));
    });
    await Effect.runPromise(
      generateEffect(resolve(fixtureDir, 'openapi.config.ts')).pipe(
        Effect.provide(generatorServicesLayer),
        Effect.provide(Logger.replace(Logger.defaultLogger, logger)),
      ) as Effect.Effect<unknown>,
    );
  };

  it('warns about the computed keys it cannot read', async () => {
    await run();

    expect(
      warnings.find((message) => message.includes('CheckoutDto.accounts')),
    ).toMatch(
      /CheckoutDto\.accounts: @ApiProperty\(\) cannot read the key `\[loadCardKey\(\)\]` statically \(.*checkout\.dto\.ts:\d+\); its entry is left out/,
    );
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
