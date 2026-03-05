import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Effect } from 'effect';
import { resolve, join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { generate } from './generate.js';
import { generateFromConfigAsync } from './internal.js';
import { generateEffect } from './generate.js';
import { generatorServicesLayer } from './service-layer.js';
import { runtimeLayerFor } from './runtime-layer.js';

const TEST_DIR = resolve(process.cwd(), '.test-behavior-regression');
const TEST_APP_DIR = resolve(
  process.cwd(),
  'e2e-applications/dto-validation',
);

describe('Behavior regression guardrails', () => {
  beforeEach(() => {
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('keeps behavior identical across public, internal, and raw Effect entrypoints', async () => {
    const configPath = join(TEST_DIR, 'behavior.config.ts');
    const outputPath = join(TEST_DIR, 'behavior.openapi.json');

    const config = `import { defineConfig } from '${resolve(process.cwd(), 'src/config.js').replace(/\\/g, '/')}';

export default defineConfig({
  output: '${outputPath.replace(/\\/g, '/')}',
  files: {
    entry: '${join(TEST_APP_DIR, 'src/app.module.ts').replace(/\\/g, '/')}',
    tsconfig: '${resolve(process.cwd(), 'tsconfig.json').replace(/\\/g, '/')}',
    dtoGlob: '${join(TEST_APP_DIR, 'src/**/*.dto.ts').replace(/\\/g, '/')}',
  },
  openapi: {
    info: { title: 'Behavior API', version: '1.0.0' },
  },
});
`;
    writeFileSync(configPath, config, 'utf-8');

    const fromPublic = await generate(configPath);
    const publicSpecContent = readFileSync(outputPath, 'utf-8');

    const fromInternal = await generateFromConfigAsync(configPath);
    const internalSpecContent = readFileSync(outputPath, 'utf-8');

    const fromEffect = await Effect.runPromise(
      generateEffect(configPath).pipe(
        Effect.provide(generatorServicesLayer),
        Effect.provide(runtimeLayerFor(false, undefined)),
      ),
    );
    const effectSpecContent = readFileSync(outputPath, 'utf-8');

    expect(fromInternal).toEqual(fromPublic);
    expect(fromEffect).toEqual(fromPublic);
    expect(internalSpecContent).toBe(publicSpecContent);
    expect(effectSpecContent).toBe(publicSpecContent);
  });
});
