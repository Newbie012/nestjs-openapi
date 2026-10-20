import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve, join } from 'node:path';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { generatePathsAsync } from './internal.js';

const TEST_DIR = resolve(process.cwd(), '.test-internal-compat');

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
