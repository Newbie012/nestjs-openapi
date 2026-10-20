import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = process.cwd();
const appDir = resolve(root, 'e2e-applications/complex-generics');

const generateFrom = (cwd: string, configPath: string) =>
  new Promise<number | null>((resolveRun, rejectRun) => {
    const child = spawn(
      resolve(root, 'node_modules/.bin/tsx'),
      [resolve(root, 'src/cli.ts'), 'generate', '-c', configPath],
      { cwd, stdio: 'ignore' },
    );
    child.on('error', rejectRun);
    child.on('close', resolveRun);
  });

describe('stable names smoke', () => {
  it('produces identical schema names from different working directories', async () => {
    const work = mkdtempSync(join(tmpdir(), 'stable-names-'));
    try {
      const run = async (label: string, cwd: string) => {
        const output = join(work, `${label}.json`);
        const configPath = join(appDir, `openapi.${label}.config.ts`);
        writeFileSync(
          configPath,
          `import { defineConfig } from '../../src/config/config.js';
export default defineConfig({
  output: '${output.replace(/\\/g, '/')}',
  files: { entry: 'src/app.module.ts', tsconfig: '../../tsconfig.json', dtoGlob: 'src/**/dto.ts' },
  openapi: { info: { title: 'Stable', version: '1.0.0' } },
});
`,
        );
        try {
          expect(await generateFrom(cwd, configPath)).toBe(0);
        } finally {
          rmSync(configPath, { force: true });
        }
        return JSON.parse(readFileSync(output, 'utf-8')) as unknown;
      };

      const fromRoot = await run('root', root);
      const fromApp = await run('app', appDir);
      const fromElsewhere = await run('elsewhere', work);

      expect(fromApp).toEqual(fromRoot);
      expect(fromElsewhere).toEqual(fromRoot);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }, 180_000);
});
