import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'path';
import { readFileSync, unlinkSync } from 'fs';
import { Effect, Logger } from 'effect';
import {
  generateEffect,
  type GenerateResult,
} from '../src/document/generate.js';
import { generatorServicesLayer } from '../src/runtime/service-layer.js';
import type { OpenApiSpec } from '../src/config/types.js';

const fixtureDir = resolve(process.cwd(), 'e2e-applications/param-dto');

describe('@Param() and @Query() DTOs E2E', () => {
  let spec: OpenApiSpec;
  let warnings: string[];
  let valid: boolean;

  beforeAll(async () => {
    warnings = [];
    const logger = Logger.make(({ logLevel, message }) => {
      if (logLevel._tag === 'Warning') warnings.push(String(message));
    });
    const result = await Effect.runPromise(
      generateEffect(resolve(fixtureDir, 'openapi.config.ts')).pipe(
        Effect.provide(generatorServicesLayer),
        Effect.provide(Logger.replace(Logger.defaultLogger, logger)),
      ) as Effect.Effect<GenerateResult>,
    );
    valid = result.validation.valid;
    const outputPath = resolve(fixtureDir, 'openapi.generated.json');
    spec = JSON.parse(readFileSync(outputPath, 'utf-8'));
    unlinkSync(outputPath);
  });

  const parametersOf = (path: string) => spec.paths[path]?.get?.parameters;

  it('writes one path parameter per @Param() DTO property', () => {
    expect(parametersOf('/owners/{ownerId}/items/{itemId}')).toEqual([
      {
        name: 'ownerId',
        in: 'path',
        required: true,
        schema: { type: 'string' },
      },
      {
        name: 'itemId',
        in: 'path',
        description: 'The item',
        required: true,
        schema: { type: 'string' },
      },
    ]);
    expect(valid).toBe(true);
  });

  it('leaves out a @Param() DTO property the route does not have, and warns', () => {
    expect(parametersOf('/owners/{ownerId}')).toEqual([
      {
        name: 'ownerId',
        in: 'path',
        required: true,
        schema: { type: 'string' },
      },
    ]);
    expect(warnings).toContain(
      'GET /owners/{ownerId}: path parameter "region" is not in the route and is left out',
    );
  });

  it('writes one query parameter per @Query() DTO property', () => {
    expect(parametersOf('/owners/{ownerId}/items')).toEqual([
      {
        name: 'ownerId',
        in: 'path',
        required: true,
        schema: { type: 'string' },
      },
      {
        name: 'search',
        in: 'query',
        required: false,
        schema: { type: 'string' },
      },
      {
        name: 'limit',
        in: 'query',
        required: true,
        schema: { type: 'integer' },
      },
    ]);
  });
});
