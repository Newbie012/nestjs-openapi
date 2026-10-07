import { describe, it, expect, afterAll } from 'vitest';
import { resolve } from 'path';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { Effect, Logger } from 'effect';
import { generateEffect } from '../src/document/generate.js';
import { generatorServicesLayer } from '../src/runtime/service-layer.js';
import { generateNamedSchemas } from '../src/schema/schema-generator.js';
import type { OpenApiSpec } from '../src/config/types.js';

/**
 * A class whose name collides with another file's, a non-exported
 * interface, and nested classes referencing both.
 */
describe('Fallback naming E2E', () => {
  const fixtureDir = resolve(process.cwd(), 'e2e-applications/fallback-naming');
  const outputPath = resolve(fixtureDir, 'openapi.generated.json');

  afterAll(() => {
    if (existsSync(outputPath)) unlinkSync(outputPath);
  });

  it('names the nested classes and logs no generation failure', async () => {
    const warnings: string[] = [];
    const logger = Logger.make(({ logLevel, message }) => {
      if (logLevel._tag === 'Warning') warnings.push(String(message));
    });

    const result = await Effect.runPromise(
      generateEffect(resolve(fixtureDir, 'openapi.config.ts')).pipe(
        Effect.provide(generatorServicesLayer),
        Effect.provide(Logger.replace(Logger.defaultLogger, logger)),
      ) as Effect.Effect<
        Awaited<ReturnType<typeof generateEffect>> extends never ? never : any,
        never,
        never
      >,
    );
    const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

    expect(result.validation.brokenRefs).toEqual([]);
    expect(Object.keys(spec.components?.schemas ?? {}).sort()).toEqual([
      'ProductReviewDto',
      'RatingInProductReviewDto',
      'VariantInProductReviewDto',
    ]);
    expect(
      warnings.filter((warning) => /Could not generate/.test(warning)),
    ).toEqual([]);
  });

  it('generates a non-exported interface by name', async () => {
    const result = await Effect.runPromise(
      generateNamedSchemas(
        new Map([
          [
            'WeightedScoreDto',
            resolve(fixtureDir, 'src/catalog/dto/product-review.dto.ts'),
          ],
        ]),
        resolve(process.cwd(), 'e2e-applications/tsconfig.json'),
      ),
    );

    expect(result.definitions['WeightedScoreDto']).toMatchObject({
      type: 'object',
      properties: { score: { type: 'number' } },
    });
  });
});
