import { describe, it, expect, afterAll } from 'vitest';
import { resolve } from 'path';
import { existsSync, unlinkSync } from 'fs';
import { Effect, Logger } from 'effect';
import { generate, generateEffect } from '../src/document/generate.js';
import { generatorServicesLayer } from '../src/runtime/service-layer.js';

/**
 * The checks of the multi-entry e2e tests that are not about the document: the
 * logged warning, the output path and the counts the generator returns. The
 * documents themselves are pinned in test/contract/filtering.
 */
describe('Multi-entry diagnostics E2E', () => {
  const fixtureDir = resolve(process.cwd(), 'e2e-applications/multi-entry');
  const outputs = [
    resolve(fixtureDir, 'openapi.generated.json'),
    resolve(fixtureDir, 'openapi.include.generated.json'),
  ];

  afterAll(() => {
    for (const outputPath of outputs) {
      if (existsSync(outputPath)) unlinkSync(outputPath);
    }
  });

  it('warns once, only about included modules no entry has', async () => {
    const warnings: { message: string; modules: unknown }[] = [];
    const logger = Logger.make(({ logLevel, message, annotations }) => {
      if (logLevel._tag !== 'Warning') return;
      warnings.push({
        message: String(message),
        modules: [...annotations].find(([key]) => key === 'modules')?.[1],
      });
    });
    await Effect.runPromise(
      generateEffect(resolve(fixtureDir, 'openapi.include.config.ts')).pipe(
        Effect.provide(generatorServicesLayer),
        Effect.provide(Logger.replace(Logger.defaultLogger, logger)),
      ) as Effect.Effect<unknown>,
    );

    expect(
      warnings.filter(({ message }) => message.includes('options.include')),
    ).toEqual([
      {
        message:
          'Modules listed in options.include were not found in the module graph',
        modules: 'OrdersModule',
      },
    ]);
  });

  it('reports the output path and the path and operation counts', async () => {
    const result = await generate(resolve(fixtureDir, 'openapi.config.ts'));

    expect(result.outputPath).toBe(outputs[0]);
    expect(result.pathCount).toBe(3);
    expect(result.operationCount).toBe(4);
  });
});
