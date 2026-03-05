import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

const fixtureDirs: string[] = [];

const createFixture = (
  files: ReadonlyArray<readonly [name: string, content: string]>,
  tsconfigContent?: string,
): { readonly dir: string; readonly tsconfig: string; readonly files: string[] } => {
  const dir = mkdtempSync(join(tmpdir(), 'nestjs-openapi-schema-batch-test-'));
  fixtureDirs.push(dir);

  const tsconfig = join(dir, 'tsconfig.json');
  writeFileSync(
    tsconfig,
    tsconfigContent ??
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            strict: true,
            noEmit: true,
            skipLibCheck: true,
          },
          include: ['./**/*.ts'],
        },
        null,
        2,
      ),
    'utf-8',
  );

  const writtenFiles = files.map(([name, content]) => {
    const filePath = join(dir, name);
    writeFileSync(filePath, content, 'utf-8');
    return filePath;
  });

  return { dir, tsconfig, files: writtenFiles };
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.doUnmock('ts-json-schema-generator');

  while (fixtureDirs.length > 0) {
    const dir = fixtureDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

const resolvePathsFromPattern = (pattern: string): string[] => {
  if (pattern.startsWith('{') && pattern.endsWith('}')) {
    return pattern
      .slice(1, -1)
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  return [pattern];
};

const createMockGenerator = (calls: string[]) =>
  vi.fn((config: { readonly path: string }) => {
    const pattern = config.path;
    calls.push(pattern);

    const filePaths = resolvePathsFromPattern(pattern);
    const definitions = Object.fromEntries(
      filePaths.map((filePath) => [
        `Def_${basename(filePath).replace(/[^a-zA-Z0-9_]/g, '_')}`,
        { type: 'object' },
      ]),
    );

    return {
      createSchema: () => ({ definitions }),
    };
  });

describe('schema-generator batching behavior', () => {
  it('parses JSONC tsconfig and keeps multi-file batch generation on the fast path', async () => {
    const fixture = createFixture(
      [
        ['a.dto.ts', 'export class A { id!: string; }\n'],
        ['b.dto.ts', 'export class B { id!: string; }\n'],
        ['c.dto.ts', 'export class C { id!: string; }\n'],
      ],
      `{
  // JSONC should be supported for temp tsconfig generation
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
  },
  "include": ["./**/*.ts"],
}`,
    );

    const calls: string[] = [];
    const createGenerator = createMockGenerator(calls);

    vi.doMock('ts-json-schema-generator', () => ({
      createGenerator,
    }));

    const { generateSchemasFromFiles } = await import('./schema-generator.js');
    const result = await Effect.runPromise(
      generateSchemasFromFiles(fixture.files, fixture.tsconfig),
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('{');
    expect(Object.keys(result.definitions)).toHaveLength(3);
  });

  it('splits failing batches instead of dropping to full per-file fallback', async () => {
    const totalFiles = 8;
    const fixture = createFixture(
      Array.from({ length: totalFiles }, (_, index) => [
        index === 3 ? 'bad.dto.ts' : `file-${index + 1}.dto.ts`,
        `export class Dto${index + 1} { id!: string; }\n`,
      ]),
    );

    const calls: string[] = [];
    const createGenerator = vi.fn((config: { readonly path: string }) => {
      const pattern = config.path;
      calls.push(pattern);

      const isBatchPattern =
        pattern.startsWith('{') && pattern.endsWith('}') && pattern.includes(',');
      const includesBad = pattern.includes('bad.dto.ts');

      if (isBatchPattern && includesBad) {
        throw new Error('Synthetic batch failure');
      }

      const filePaths = resolvePathsFromPattern(pattern);
      const definitions = Object.fromEntries(
        filePaths.map((filePath) => [
          `Def_${basename(filePath).replace(/[^a-zA-Z0-9_]/g, '_')}`,
          { type: 'object' },
        ]),
      );

      return {
        createSchema: () => ({ definitions }),
      };
    });

    vi.doMock('ts-json-schema-generator', () => ({
      createGenerator,
    }));

    const { generateSchemasFromFiles } = await import('./schema-generator.js');
    const result = await Effect.runPromise(
      generateSchemasFromFiles(fixture.files, fixture.tsconfig),
    );

    expect(Object.keys(result.definitions)).toHaveLength(totalFiles);
    // Old strategy would do: 1 failing batch + 8 individual attempts = 9 calls.
    expect(calls.length).toBeLessThan(totalFiles + 1);
  });
});
