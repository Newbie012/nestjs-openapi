import { describe, it, expect, afterAll } from 'vitest';
import { resolve } from 'path';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { generate } from '../src/document/generate.js';
import type { OpenApiSpec } from '../src/config/types.js';

describe('overlay E2E', () => {
  const fixtureDir = resolve(process.cwd(), 'e2e-applications/overlay');
  const outputs = [
    'openapi.generated.json',
    'openapi.stale.generated.json',
  ].map((file) => resolve(fixtureDir, file));

  afterAll(() => {
    for (const output of outputs) {
      if (existsSync(output)) unlinkSync(output);
    }
  });

  it('applies the overlay file named in the config to the written spec', async () => {
    const result = await generate(resolve(fixtureDir, 'openapi.config.ts'));
    const spec: OpenApiSpec = JSON.parse(readFileSync(outputs[0]!, 'utf-8'));

    expect(Object.keys(spec.paths)).toEqual(['/books', '/books/{id}']);
    expect(Object.keys(spec.paths['/books/{id}']!)).toEqual(['get']);
    expect(spec.paths['/books']?.get).toMatchObject({
      summary: 'List books',
      'x-rate-limit': { perMinute: 100 },
    });
    expect(spec.paths['/books']).toMatchObject({ summary: 'Books' });
    expect(result).toMatchObject({ pathCount: 2, operationCount: 2 });
    expect(result.validation.valid).toBe(true);
  });

  it('fails generation when an action targets a route that no longer exists', async () => {
    await expect(
      generate(resolve(fixtureDir, 'openapi.stale.config.ts')),
    ).rejects.toThrow(
      `action 1 (target "$.paths['/novels'].get", "Describe the novel listing") matched nothing`,
    );
    expect(existsSync(outputs[1]!)).toBe(false);
  });
});
