import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { resolve } from 'path';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { Effect, Logger } from 'effect';
import { generateEffect } from '../src/document/generate.js';
import { generatorServicesLayer } from '../src/runtime/service-layer.js';
import type { OpenApiSpec } from '../src/config/types.js';

/**
 * With several entries, `options.include` names modules across all of
 * them: a module found in one entry is found.
 */
describe('Multi-entry include E2E', () => {
  const fixtureDir = resolve(process.cwd(), 'e2e-applications/multi-entry');
  const outputPath = resolve(fixtureDir, 'openapi.include.generated.json');
  const warnings: { message: string; modules: unknown }[] = [];
  let spec: OpenApiSpec;

  beforeAll(async () => {
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
    spec = JSON.parse(readFileSync(outputPath, 'utf-8'));
  });

  afterAll(() => {
    if (existsSync(outputPath)) unlinkSync(outputPath);
  });

  it('documents the included modules of every entry', () => {
    expect(Object.keys(spec.paths).sort()).toEqual([
      '/products',
      '/users',
      '/users/{id}',
    ]);
  });

  it('warns once, only about modules no entry has', () => {
    const missing = warnings.filter(({ message }) =>
      message.includes('options.include'),
    );
    expect(missing).toEqual([
      {
        message:
          'Modules listed in options.include were not found in the module graph',
        modules: 'OrdersModule',
      },
    ]);
  });
});
