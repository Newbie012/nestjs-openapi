import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Effect } from 'effect';
import ts from 'typescript';
import {
  generateSchemas,
  generateSchemasFromFiles,
} from './schema-generator.js';

const fixtureDirs: string[] = [];

const createFixture = (
  files: ReadonlyArray<readonly [name: string, content: string]>,
): { readonly dir: string; readonly tsconfig: string } => {
  const dir = mkdtempSync(join(tmpdir(), 'nestjs-openapi-schema-gen-test-'));
  fixtureDirs.push(dir);

  const tsconfig = join(dir, 'tsconfig.json');
  writeFileSync(
    tsconfig,
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

  for (const [name, content] of files) {
    writeFileSync(join(dir, name), content, 'utf-8');
  }

  return { dir, tsconfig };
};

afterEach(() => {
  while (fixtureDirs.length > 0) {
    const dir = fixtureDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('schema-generator regressions', () => {
  it('generates schemas for files containing classes that implement external interfaces', async () => {
    const fixture = createFixture([
      [
        'dto.ts',
        `
export class CreateDto {
  name!: string;
}

export class ResponseDto implements PromiseLike<string> {
  id!: string;

  then(): PromiseLike<string> {
    return this as unknown as PromiseLike<string>;
  }
}
`,
      ],
    ]);

    const schemas = await Effect.runPromise(
      generateSchemasFromFiles([join(fixture.dir, 'dto.ts')], fixture.tsconfig),
    );

    expect(schemas.definitions['CreateDto']).toBeDefined();
    expect(schemas.definitions['ResponseDto']).toBeDefined();
  });

  it('generates schemas for files containing classes that extend framework base classes', async () => {
    const fixture = createFixture([
      [
        'errors.ts',
        `
import { HttpException, HttpStatus } from '@nestjs/common';

export class ConflictError extends HttpException {
  constructor(public readonly conflicts: Array<{ id: string }>) {
    super({ message: 'conflict', conflicts }, HttpStatus.CONFLICT);
  }
}
`,
      ],
    ]);

    const schemas = await Effect.runPromise(
      generateSchemasFromFiles(
        [join(fixture.dir, 'errors.ts')],
        fixture.tsconfig,
      ),
    );

    expect(schemas.definitions['ConflictError']).toBeDefined();
  });

  it('generates schemas from more than one internal batch without dropping definitions', async () => {
    const totalDtos = 20;
    const dtoFiles = Array.from({ length: totalDtos }, (_, index) => {
      const dtoName = `BulkDto${index + 1}`;
      return [
        `bulk-${index + 1}.dto.ts`,
        `export class ${dtoName} { value!: string; }\n`,
      ] as const;
    });

    const fixture = createFixture(dtoFiles);
    const filePaths = dtoFiles.map(([name]) => join(fixture.dir, name));

    // Include a duplicate path to verify dedupe behavior does not alter output.
    const schemas = await Effect.runPromise(
      generateSchemasFromFiles([...filePaths, filePaths[0]], fixture.tsconfig),
    );

    for (let index = 0; index < totalDtos; index += 1) {
      expect(schemas.definitions[`BulkDto${index + 1}`]).toBeDefined();
    }
  });

  it('reflects source file changes between runs', async () => {
    const fixture = createFixture([
      [
        'cache.dto.ts',
        `
export class CacheDto {
  name!: string;
}
`,
      ],
    ]);

    const targetFile = join(fixture.dir, 'cache.dto.ts');

    const first = await Effect.runPromise(
      generateSchemasFromFiles([targetFile], fixture.tsconfig),
    );
    expect(first.definitions['CacheDto']).toBeDefined();

    writeFileSync(
      targetFile,
      `
export class CacheDto {
  age!: number;
}
`,
      'utf-8',
    );

    const second = await Effect.runPromise(
      generateSchemasFromFiles([targetFile], fixture.tsconfig),
    );
    const schema = second.definitions['CacheDto'] as
      | { properties?: Record<string, unknown> }
      | undefined;
    const properties = schema?.properties ?? {};

    expect(properties['age']).toBeDefined();
    expect(properties['name']).toBeUndefined();
  });
});

describe('generateSchemas with a shared program', () => {
  const programFor = (files: readonly string[]) =>
    ts.createProgram(files, {
      target: ts.ScriptTarget.ES2022,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    });

  it('skips a pattern that matches no file instead of passing it to the generator', async () => {
    const fixture = createFixture([
      ['a.dto.ts', 'export class ADto { a!: string; }\n'],
    ]);
    const program = programFor([join(fixture.dir, 'a.dto.ts')]);

    const schemas = await Effect.runPromise(
      generateSchemas({
        dtoGlob: ['missing/*.dto.ts'],
        tsconfig: fixture.tsconfig,
        basePath: fixture.dir,
        reuseProgram: program,
      }),
    );

    expect(schemas.definitions).toEqual({});
  });

  it('reads a brace pattern of absolute paths as it is, without joining the base path', async () => {
    const fixture = createFixture([
      ['a.dto.ts', 'export class ADto { a!: string; }\n'],
      ['b.dto.ts', 'export class BDto { b!: string; }\n'],
    ]);
    const program = programFor([
      join(fixture.dir, 'a.dto.ts'),
      join(fixture.dir, 'b.dto.ts'),
    ]);

    const schemas = await Effect.runPromise(
      generateSchemas({
        dtoGlob: [
          `{${join(fixture.dir, 'a.dto.ts')},${join(fixture.dir, 'b.dto.ts')}}`,
        ],
        tsconfig: fixture.tsconfig,
        basePath: '/nowhere',
        reuseProgram: program,
      }),
    );

    expect(Object.keys(schemas.definitions).sort()).toEqual(['ADto', 'BDto']);
  });
});
