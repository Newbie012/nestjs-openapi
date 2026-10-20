import { describe, it, expect, afterAll } from 'vitest';
import { resolve } from 'path';
import { existsSync, unlinkSync } from 'fs';
import { Effect, Logger } from 'effect';
import {
  generateEffect,
  type GenerateResult,
} from '../src/document/generate.js';
import { generatorServicesLayer } from '../src/runtime/service-layer.js';

/**
 * The checks of the @Param() and @Query() DTO e2e test that are not about the
 * document: the logged warning and the generator's own verdict. The document
 * itself is pinned in test/contract/parameters.
 */
describe('@Param() DTO diagnostics E2E', () => {
  const fixtureDir = resolve(process.cwd(), 'e2e-applications/param-dto');
  const outputPath = resolve(fixtureDir, 'openapi.generated.json');

  afterAll(() => {
    if (existsSync(outputPath)) unlinkSync(outputPath);
  });

  it('warns about a @Param() DTO property the route does not have, and validates', async () => {
    const warnings: string[] = [];
    const logger = Logger.make(({ logLevel, message }) => {
      if (logLevel._tag === 'Warning') warnings.push(String(message));
    });
    const result = await Effect.runPromise(
      generateEffect(resolve(fixtureDir, 'openapi.config.ts')).pipe(
        Effect.provide(generatorServicesLayer),
        Effect.provide(Logger.replace(Logger.defaultLogger, logger)),
      ) as Effect.Effect<GenerateResult>,
    );

    expect(result.validation.valid).toBe(true);
    expect(warnings).toContain(
      'GET /owners/{ownerId}: path parameter "region" is not in the route and is left out',
    );
  });
});
