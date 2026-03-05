import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve, join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import {
  generateFromConfigAsync,
  generatePathsAsync,
} from './internal.js';
import { generate } from './generate.js';

const TEST_DIR = resolve(process.cwd(), '.test-internal-compat');
const TEST_APP_DIR = resolve(
  process.cwd(),
  'e2e-applications/dto-validation',
);

describe('Promise API compatibility wrappers', () => {
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

  it('generateFromConfigAsync is behavior-compatible with generate()', async () => {
    const configPath = join(TEST_DIR, 'compat.config.ts');
    const outputPath = join(TEST_DIR, 'compat.openapi.json');

    const config = `import { defineConfig } from '${resolve(process.cwd(), 'src/config.js').replace(/\\/g, '/')}';

export default defineConfig({
  output: '${outputPath.replace(/\\/g, '/')}',
  files: {
    entry: '${join(TEST_APP_DIR, 'src/app.module.ts').replace(/\\/g, '/')}',
    tsconfig: '${resolve(process.cwd(), 'tsconfig.json').replace(/\\/g, '/')}',
    dtoGlob: '${join(TEST_APP_DIR, 'src/**/*.dto.ts').replace(/\\/g, '/')}',
  },
  openapi: {
    info: { title: 'Compat API', version: '1.0.0' },
  },
});
`;
    writeFileSync(configPath, config, 'utf-8');

    const fromPublicApi = await generate(configPath);
    const fromInternalAsync = await generateFromConfigAsync(configPath);

    expect(fromInternalAsync).toEqual(fromPublicApi);
    expect(fromInternalAsync.outputPath).toBe(outputPath);
    expect(fromInternalAsync.pathCount).toBeGreaterThan(0);
    expect(fromInternalAsync.operationCount).toBeGreaterThan(0);
    expect(fromInternalAsync.schemaCount).toBeGreaterThan(0);

    const writtenSpec = JSON.parse(readFileSync(outputPath, 'utf-8')) as {
      readonly openapi?: string;
    };
    expect(writtenSpec.openapi).toBe('3.0.3');
  });

  it('generatePathsAsync maps tagged failures to PublicApiError', async () => {
    const missingEntryPath = join(TEST_DIR, 'does-not-exist.module.ts');

    await expect(() =>
      generatePathsAsync({
        tsconfig: resolve(process.cwd(), 'tsconfig.json'),
        entry: missingEntryPath,
      }),
    ).rejects.toThrowError(/Source file not found/);
  });
});
