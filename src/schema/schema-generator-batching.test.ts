import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  vi.doUnmock('./schema-program.js');

  while (fixtureDirs.length > 0) {
    const dir = fixtureDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

type ProgramOptions = {
  readonly rootFiles: readonly string[];
  readonly virtualFiles?: ReadonlyMap<string, string>;
};

/**
 * A fake generator handle over files of `export class Name { ... }`: one
 * root per file, named after the class. `fails(name, text)` decides which
 * roots throw.
 */
const createFakeHandle = (
  options: ProgramOptions,
  fails: (name: string, text: string) => boolean = () => false,
) => {
  const roots = options.rootFiles.map((filePath) => {
    const text = options.virtualFiles?.get(filePath) ?? readFileSync(filePath, 'utf-8');
    const name = /class (\w+)/.exec(text)?.[1] ?? basename(filePath);
    return { name, filePath, node: { name, text } };
  });
  const definitionsOf = (nodes: readonly { name: string; text: string }[]) => {
    for (const node of nodes) {
      if (fails(node.name, node.text)) {
        throw new Error("Cannot read properties of undefined (reading 'flags')");
      }
    }
    return {
      definitions: Object.fromEntries(
        nodes.map((node) => [node.name, { type: 'object' }]),
      ),
    };
  };
  return {
    createSchema: () => definitionsOf(roots.map((root) => root.node)),
    rootTypes: () => roots,
    findType: (filePath: string, name: string) =>
      roots.find((root) => root.filePath === filePath && root.name === name)?.node,
    inlineExternalTypes: () => undefined,
    createSchemaForNodes: (nodes: readonly { name: string; text: string }[]) =>
      definitionsOf(nodes),
  };
};

describe('schema-generator programs', () => {
  it('builds one program for all files', async () => {
    const fixture = createFixture(
      [
        ['a.dto.ts', 'export class A { id!: string; }\n'],
        ['b.dto.ts', 'export class B { id!: string; }\n'],
        ['c.dto.ts', 'export class C { id!: string; }\n'],
      ],
      `{
  // JSONC is accepted
  "compilerOptions": { "strict": true, },
}`,
    );

    const programs: (readonly string[])[] = [];
    const createSchemaGenerator = vi.fn((options: ProgramOptions) => {
      programs.push(options.rootFiles);
      return Effect.succeed(createFakeHandle(options));
    });
    vi.doMock('./schema-program.js', async (importOriginal) => ({
      ...(await importOriginal<typeof import('./schema-program.js')>()),
      createSchemaGenerator,
    }));

    const { generateSchemasFromFiles } = await import('./schema-generator.js');
    const result = await Effect.runPromise(
      generateSchemasFromFiles(fixture.files, fixture.tsconfig),
    );

    expect(programs).toHaveLength(1);
    expect(programs[0]).toHaveLength(3);
    expect(Object.keys(result.definitions).sort()).toEqual(['A', 'B', 'C']);
  });

  it('retries the types of a failing run in the same program', async () => {
    const totalFiles = 8;
    const fixture = createFixture(
      Array.from({ length: totalFiles }, (_, index) => [
        `file-${index + 1}.dto.ts`,
        `export class Dto${index + 1} { id!: string; }\n`,
      ]),
    );

    let programs = 0;
    const createSchemaGenerator = vi.fn((options: ProgramOptions) => {
      programs += 1;
      // Dto4 fails in every program: it is reported, not retried forever
      return Effect.succeed(createFakeHandle(options, (name) => name === 'Dto4'));
    });
    vi.doMock('./schema-program.js', async (importOriginal) => ({
      ...(await importOriginal<typeof import('./schema-program.js')>()),
      createSchemaGenerator,
    }));

    const { generateSchemasFromFiles } = await import('./schema-generator.js');
    const result = await Effect.runPromise(
      generateSchemasFromFiles(fixture.files, fixture.tsconfig),
    );

    expect(Object.keys(result.definitions)).toHaveLength(totalFiles);
    // Kept as any value, so references to it stay valid
    expect(result.definitions['Dto4']).toEqual({});
    // One program for the run, plus a bounded number for Dto4's recovery
    expect(programs).toBeLessThanOrEqual(3);
  });
});

describe('schema-generator property isolation', () => {
  it('generates a type without the property the generator crashes on', async () => {
    const fixture = createFixture([
      [
        'image.dto.ts',
        [
          "import { z } from 'zod';",
          'declare const metadataSchema: unknown;',
          'export class ImageDto {',
          '  id!: string;',
          '  metadata!: z.infer<typeof metadataSchema>;',
          '}',
          '',
        ].join('\n'),
      ],
    ]);

    // Like ts-json-schema-generator on zod types: no source position
    const createSchemaGenerator = vi.fn((options: ProgramOptions) =>
      Effect.succeed(
        createFakeHandle(options, (_name, text) => text.includes('z.infer')),
      ),
    );
    vi.doMock('./schema-program.js', async (importOriginal) => ({
      ...(await importOriginal<typeof import('./schema-program.js')>()),
      createSchemaGenerator,
    }));

    const { generateSchemasFromFiles } = await import('./schema-generator.js');
    const result = await Effect.runPromise(
      generateSchemasFromFiles(fixture.files, fixture.tsconfig),
    );

    expect(Object.keys(result.definitions)).toEqual(['ImageDto']);
  });
});
