import { afterEach, describe, expect, it } from 'vitest';
import { Effect, Layer } from 'effect';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ProjectService,
  ProjectServiceLive,
  makeProjectContext,
} from './project.js';

const makeFixture = (
  options: { readonly className?: string } = {},
): {
  readonly dir: string;
  readonly tsconfigPath: string;
  readonly entryPath: string;
} => {
  const dir = mkdtempSync(join(tmpdir(), 'nestjs-openapi-project-test-'));
  const tsconfigPath = join(dir, 'tsconfig.json');
  const entryPath = join(dir, 'app.module.ts');

  writeFileSync(
    tsconfigPath,
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          noEmit: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
        },
        include: ['*.ts'],
      },
      null,
      2,
    ),
    'utf-8',
  );

  const className = options.className ?? 'AppModule';
  writeFileSync(
    entryPath,
    `export class ${className} {}`,
    'utf-8',
  );

  return { dir, tsconfigPath, entryPath };
};

describe('ProjectService', () => {
  const fixtureDirs: string[] = [];

  afterEach(() => {
    while (fixtureDirs.length > 0) {
      const dir = fixtureDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('creates project context for a valid entry module', async () => {
    const fixture = makeFixture();
    fixtureDirs.push(fixture.dir);

    const context = await Effect.runPromise(
      makeProjectContext({
        tsconfig: fixture.tsconfigPath,
        entry: fixture.entryPath,
      }),
    );

    expect(context.entrySourceFile.getFilePath()).toBe(fixture.entryPath);
    expect(context.entryClass.getName()).toBe('AppModule');
  });

  it('supports catchTag recovery for missing entry file', async () => {
    const fixture = makeFixture();
    fixtureDirs.push(fixture.dir);

    const recovered = await Effect.runPromise(
      makeProjectContext({
        tsconfig: fixture.tsconfigPath,
        entry: join(fixture.dir, 'missing.module.ts'),
      }).pipe(
        Effect.catchTag('EntryNotFoundError', (error) =>
          Effect.succeed(error.message),
        ),
      ),
    );

    expect(recovered).toContain('Source file not found');
  });

  it('supports catchTag recovery for missing AppModule class', async () => {
    const fixture = makeFixture({ className: 'DifferentModule' });
    fixtureDirs.push(fixture.dir);

    const recovered = await Effect.runPromise(
      makeProjectContext({
        tsconfig: fixture.tsconfigPath,
        entry: fixture.entryPath,
      }).pipe(
        Effect.catchTag('EntryNotFoundError', (error) =>
          Effect.succeed(error.message),
        ),
      ),
    );

    expect(recovered).toContain("Entry class 'AppModule' not found");
  });

  it('wires ProjectServiceLive layer and provides context to dependents', async () => {
    const fixture = makeFixture();
    fixtureDirs.push(fixture.dir);

    const program = Effect.gen(function* () {
      const context = yield* ProjectService.makeProjectContext({
        tsconfig: fixture.tsconfigPath,
        entry: fixture.entryPath,
      });
      return context.entryClass.getName();
    }).pipe(
      Effect.provide(
        ProjectServiceLive({
          tsconfig: fixture.tsconfigPath,
          entry: fixture.entryPath,
        }),
      ),
    );

    const className = await Effect.runPromise(program);
    expect(className).toBe('AppModule');
  });

  it('propagates layer initialization failures with typed error handling', async () => {
    const fixture = makeFixture();
    fixtureDirs.push(fixture.dir);

    const program = Effect.gen(function* () {
      const context = yield* ProjectService.makeProjectContext({
        tsconfig: fixture.tsconfigPath,
        entry: join(fixture.dir, 'does-not-exist.ts'),
      });
      return context.entryClass.getName();
    }).pipe(
      Effect.provide(
        ProjectServiceLive({
          tsconfig: fixture.tsconfigPath,
          entry: join(fixture.dir, 'does-not-exist.ts'),
        }),
      ),
      Effect.catchTag('EntryNotFoundError', (error) =>
        Effect.succeed(error._tag),
      ),
    );

    const tag = await Effect.runPromise(program);
    expect(tag).toBe('EntryNotFoundError');
  });

  it('can merge the service layer into a composite layer graph', async () => {
    const fixture = makeFixture();
    fixtureDirs.push(fixture.dir);

    const layer = Layer.mergeAll(
      ProjectServiceLive({
        tsconfig: fixture.tsconfigPath,
        entry: fixture.entryPath,
      }),
    );

    const className = await Effect.runPromise(
      Effect.gen(function* () {
        const context = yield* ProjectService.makeProjectContext({
          tsconfig: fixture.tsconfigPath,
          entry: fixture.entryPath,
        });
        return context.entryClass.getName();
      }).pipe(Effect.provide(layer)),
    );

    expect(className).toBe('AppModule');
  });
});
