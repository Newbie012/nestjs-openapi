import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const TEST_DIR = resolve(process.cwd(), '.test-cli-regression');

const runCli = (
  args: readonly string[],
): Promise<{ readonly status: number | null; readonly stdout: string; readonly stderr: string }> =>
  new Promise((resolveRun, rejectRun) => {
    const child = spawn('pnpm', ['-s', 'tsx', 'src/cli.ts', ...args], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on('error', rejectRun);
    child.on('close', (status) => {
      resolveRun({ status, stdout, stderr });
    });
  });

describe('cli regressions', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('should exit non-zero when generated spec has broken refs', async () => {
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

    const cliResult = await runCli(['generate', '-c', configPath]);

    expect(cliResult.status).toBe(1);
  }, 60_000);

  it('should exit non-zero when generated spec has unresolved generic refs', async () => {
    const appDir = join(TEST_DIR, 'generic-app');
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
  getUsers(): PaginatedResponse<MissingUserDto> {
    return { items: [], total: 0 } as unknown as PaginatedResponse<MissingUserDto>;
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

    const configPath = join(TEST_DIR, 'generic-openapi.config.ts');
    writeFileSync(
      configPath,
      `
import { defineConfig } from '${resolve(process.cwd(), 'src/config.js').replace(/\\/g, '/')}';

export default defineConfig({
  output: '${join(TEST_DIR, 'generic-openapi.generated.json').replace(/\\/g, '/')}',
  files: {
    entry: '${join(srcDir, 'app.module.ts').replace(/\\/g, '/')}',
    tsconfig: '${join(appDir, 'tsconfig.json').replace(/\\/g, '/')}',
  },
  openapi: {
    info: { title: 'CLI generic regression', version: '1.0.0' },
  },
});
`,
      'utf-8',
    );

    const cliResult = await runCli(['generate', '-c', configPath]);

    expect(cliResult.status).toBe(1);
  }, 60_000);

  it('should fail fast on invalid --otel-exporter value', async () => {
    const cliResult = await runCli([
      'generate',
      '-c',
      'openapi.config.ts',
      '--otel',
      '--otel-exporter',
      'invalid-exporter',
    ]);

    expect(cliResult.status).toBe(1);
    expect(cliResult.stderr).toContain('Invalid --otel-exporter');
  });
});
