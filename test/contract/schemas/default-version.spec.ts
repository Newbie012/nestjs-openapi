import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { generate } from '../../../src/document/generate.js';

/**
 * The contract harness always sets a version, so the default for a config
 * without one is pinned here against a fixture that configures none.
 */
describe('default OpenAPI version', () => {
  const fixtureDir = resolve(
    process.cwd(),
    'e2e-applications/api-property-enum',
  );
  const outputPath = resolve(fixtureDir, 'openapi.generated.json');

  afterAll(() => {
    if (existsSync(outputPath)) unlinkSync(outputPath);
  });

  it('generates 3.0.3 when the config names no version', async () => {
    await generate(resolve(fixtureDir, 'openapi.config.ts'));

    const spec = JSON.parse(readFileSync(outputPath, 'utf-8'));
    expect(spec.openapi).toBe('3.0.3');
  });
});
