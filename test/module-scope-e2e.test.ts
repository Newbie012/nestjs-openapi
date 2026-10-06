import { describe, it, expect, afterAll } from 'vitest';
import { resolve } from 'path';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { generate } from '../src/generate.js';
import type { OpenApiSpec } from '../src/types.js';

/**
 * `options.include` and `options.deepScanRoutes` follow the options of the
 * same name in SwaggerModule.createDocument().
 */
describe('Module scope E2E', () => {
  const fixtureDir = resolve(process.cwd(), 'e2e-applications/module-scope');
  const variants = ['all', 'include', 'deep'] as const;

  const generatePaths = async (variant: (typeof variants)[number]) => {
    await generate(resolve(fixtureDir, `openapi.${variant}.config.ts`));
    const spec: OpenApiSpec = JSON.parse(
      readFileSync(resolve(fixtureDir, `openapi.${variant}.generated.json`), 'utf-8'),
    );
    return Object.keys(spec.paths).sort();
  };

  afterAll(() => {
    for (const variant of variants) {
      const outputPath = resolve(fixtureDir, `openapi.${variant}.generated.json`);
      if (existsSync(outputPath)) unlinkSync(outputPath);
    }
  });

  it('documents every reachable controller by default', async () => {
    expect(await generatePaths('all')).toEqual([
      '/external',
      '/feature',
      '/internal',
      '/shared',
    ]);
  });

  it('documents only controllers declared in the included modules', async () => {
    expect(await generatePaths('include')).toEqual(['/external']);
  });

  it('adds the controllers of direct, non-global imports with deepScanRoutes', async () => {
    expect(await generatePaths('deep')).toEqual(['/external', '/feature']);
  });
});
