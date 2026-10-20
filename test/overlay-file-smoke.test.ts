import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import { generate } from '../src/document/generate.js';

describe('overlay file smoke', () => {
  const fixtureDir = resolve(process.cwd(), 'e2e-applications/overlay');
  const outputPath = resolve(fixtureDir, 'openapi.generated.json');

  afterAll(() => {
    if (existsSync(outputPath)) unlinkSync(outputPath);
  });

  it('applies the overlay YAML file named in the config and writes a valid spec', async () => {
    const result = await generate(resolve(fixtureDir, 'openapi.config.ts'));

    expect(result.outputPath).toBe(outputPath);
    expect(existsSync(outputPath)).toBe(true);
    expect(result).toMatchObject({ pathCount: 2, operationCount: 2 });
    expect(result.validation.valid).toBe(true);
  });
});
