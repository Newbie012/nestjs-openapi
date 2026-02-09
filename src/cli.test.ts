import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const TEST_DIR = resolve(process.cwd(), '.test-cli-regression');

describe('cli regressions', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('should exit non-zero when generated spec has broken refs', () => {
    const appDir = join(TEST_DIR, 'app');
    const srcDir = join(appDir, 'src');

    mkdirSync(srcDir, { recursive: true });

    writeFileSync(
      join(appDir, 'tsconfig.json'),
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
          include: ['src/**/*.ts'],
        },
        null,
        2,
      ),
      'utf-8',
    );

    writeFileSync(
      join(srcDir, 'app.controller.ts'),
      `
import { Controller, Get } from '@nestjs/common';

@Controller('users')
export class AppController {
  @Get()
  getUser(): MissingUserDto {
    return { id: '1' } as unknown as MissingUserDto;
  }
}
`,
      'utf-8',
    );

    writeFileSync(
      join(srcDir, 'app.module.ts'),
      `
import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';

@Module({
  controllers: [AppController],
})
export class AppModule {}
`,
      'utf-8',
    );

    const configPath = join(TEST_DIR, 'openapi.config.ts');
    writeFileSync(
      configPath,
      `
import { defineConfig } from '${resolve(process.cwd(), 'src/config.js').replace(/\\/g, '/')}';

export default defineConfig({
  output: '${join(TEST_DIR, 'openapi.generated.json').replace(/\\/g, '/')}',
  files: {
    entry: '${join(srcDir, 'app.module.ts').replace(/\\/g, '/')}',
    tsconfig: '${join(appDir, 'tsconfig.json').replace(/\\/g, '/')}',
  },
  openapi: {
    info: { title: 'CLI regression', version: '1.0.0' },
  },
});
`,
      'utf-8',
    );

    const cliResult = spawnSync(
      'pnpm',
      ['-s', 'tsx', 'src/cli.ts', 'generate', '-c', configPath],
      {
        cwd: process.cwd(),
        encoding: 'utf-8',
      },
    );

    expect(cliResult.status).toBe(1);
  });
});
