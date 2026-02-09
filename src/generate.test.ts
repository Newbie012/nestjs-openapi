import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve, join } from 'path';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import yaml from 'js-yaml';
import { generate } from './generate.js';

const TEST_DIR = resolve(process.cwd(), '.test-tmp');

describe('generate', () => {
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

  describe('output format', () => {
    // Use a minimal existing test app
    const testAppDir = resolve(
      process.cwd(),
      'e2e-applications/dto-validation',
    );

    it('should output JSON when format is "json"', async () => {
      const configPath = join(TEST_DIR, 'json.config.ts');
      const outputPath = join(TEST_DIR, 'output.json');

      const config = `import { defineConfig } from '${resolve(process.cwd(), 'src/config.js').replace(/\\/g, '/')}';

export default defineConfig({
  output: '${outputPath.replace(/\\/g, '/')}',
  format: 'json',
  files: {
    entry: '${join(testAppDir, 'src/app.module.ts').replace(/\\/g, '/')}',
    tsconfig: '${resolve(process.cwd(), 'tsconfig.json').replace(/\\/g, '/')}',
    dtoGlob: '${join(testAppDir, 'src/**/*.dto.ts').replace(/\\/g, '/')}',
  },
  openapi: {
    info: { title: 'Test API', version: '1.0.0' },
  },
});
`;
      writeFileSync(configPath, config, 'utf-8');

      await generate(configPath);

      const content = readFileSync(outputPath, 'utf-8');
      expect(content.startsWith('{')).toBe(true);
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('should output YAML when format is "yaml"', async () => {
      const configPath = join(TEST_DIR, 'yaml.config.ts');
      const outputPath = join(TEST_DIR, 'output.yaml');

      const config = `import { defineConfig } from '${resolve(process.cwd(), 'src/config.js').replace(/\\/g, '/')}';

export default defineConfig({
  output: '${outputPath.replace(/\\/g, '/')}',
  format: 'yaml',
  files: {
    entry: '${join(testAppDir, 'src/app.module.ts').replace(/\\/g, '/')}',
    tsconfig: '${resolve(process.cwd(), 'tsconfig.json').replace(/\\/g, '/')}',
    dtoGlob: '${join(testAppDir, 'src/**/*.dto.ts').replace(/\\/g, '/')}',
  },
  openapi: {
    info: { title: 'Test API', version: '1.0.0' },
  },
});
`;
      writeFileSync(configPath, config, 'utf-8');

      await generate(configPath);

      const content = readFileSync(outputPath, 'utf-8');
      expect(content.startsWith('{')).toBe(false);
      expect(() => yaml.load(content)).not.toThrow();

      const parsed = yaml.load(content) as Record<string, unknown>;
      expect(parsed.openapi).toBe('3.0.3');
    });

    it('should default to JSON when format is not specified', async () => {
      const configPath = join(TEST_DIR, 'default.config.ts');
      const outputPath = join(TEST_DIR, 'output-default.json');

      const config = `import { defineConfig } from '${resolve(process.cwd(), 'src/config.js').replace(/\\/g, '/')}';

export default defineConfig({
  output: '${outputPath.replace(/\\/g, '/')}',
  files: {
    entry: '${join(testAppDir, 'src/app.module.ts').replace(/\\/g, '/')}',
    tsconfig: '${resolve(process.cwd(), 'tsconfig.json').replace(/\\/g, '/')}',
    dtoGlob: '${join(testAppDir, 'src/**/*.dto.ts').replace(/\\/g, '/')}',
  },
  openapi: {
    info: { title: 'Test API', version: '1.0.0' },
  },
});
`;
      writeFileSync(configPath, config, 'utf-8');

      await generate(configPath);

      const content = readFileSync(outputPath, 'utf-8');
      expect(content.startsWith('{')).toBe(true);
    });

    it('should allow format override via options parameter', async () => {
      const configPath = join(TEST_DIR, 'override.config.ts');
      const outputPath = join(TEST_DIR, 'output-override.yaml');

      // Config specifies JSON but we'll override to YAML
      const config = `import { defineConfig } from '${resolve(process.cwd(), 'src/config.js').replace(/\\/g, '/')}';

export default defineConfig({
  output: '${outputPath.replace(/\\/g, '/')}',
  format: 'json',
  files: {
    entry: '${join(testAppDir, 'src/app.module.ts').replace(/\\/g, '/')}',
    tsconfig: '${resolve(process.cwd(), 'tsconfig.json').replace(/\\/g, '/')}',
    dtoGlob: '${join(testAppDir, 'src/**/*.dto.ts').replace(/\\/g, '/')}',
  },
  openapi: {
    info: { title: 'Test API', version: '1.0.0' },
  },
});
`;
      writeFileSync(configPath, config, 'utf-8');

      await generate(configPath, { format: 'yaml' });

      const content = readFileSync(outputPath, 'utf-8');
      // Should be YAML, not JSON
      expect(content.startsWith('{')).toBe(false);
      expect(() => yaml.load(content)).not.toThrow();
    });
  });

  describe('spec field order', () => {
    const testAppDir = resolve(
      process.cwd(),
      'e2e-applications/dto-validation',
    );

    it('should output fields in standard OpenAPI order: openapi, info, servers, paths, components, tags', async () => {
      const configPath = join(TEST_DIR, 'order.config.ts');
      const outputPath = join(TEST_DIR, 'order.json');

      const config = `import { defineConfig } from '${resolve(process.cwd(), 'src/config.js').replace(/\\/g, '/')}';

export default defineConfig({
  output: '${outputPath.replace(/\\/g, '/')}',
  format: 'json',
  files: {
    entry: '${join(testAppDir, 'src/app.module.ts').replace(/\\/g, '/')}',
    tsconfig: '${resolve(process.cwd(), 'tsconfig.json').replace(/\\/g, '/')}',
    dtoGlob: '${join(testAppDir, 'src/**/*.dto.ts').replace(/\\/g, '/')}',
  },
  openapi: {
    info: { title: 'Test API', version: '1.0.0' },
    servers: [{ url: 'http://localhost:3000' }],
    tags: [{ name: 'test' }],
  },
});
`;
      writeFileSync(configPath, config, 'utf-8');

      await generate(configPath);

      const content = readFileSync(outputPath, 'utf-8');
      const keys = Object.keys(JSON.parse(content));

      // Verify exact order
      expect(keys).toEqual([
        'openapi',
        'info',
        'servers',
        'paths',
        'components',
        'tags',
      ]);
    });
  });

  describe('YAML output options', () => {
    const testAppDir = resolve(
      process.cwd(),
      'e2e-applications/dto-validation',
    );

    it('should not use YAML anchors/aliases', async () => {
      const configPath = join(TEST_DIR, 'no-refs.config.ts');
      const outputPath = join(TEST_DIR, 'no-refs.yaml');

      const config = `import { defineConfig } from '${resolve(process.cwd(), 'src/config.js').replace(/\\/g, '/')}';

export default defineConfig({
  output: '${outputPath.replace(/\\/g, '/')}',
  format: 'yaml',
  files: {
    entry: '${join(testAppDir, 'src/app.module.ts').replace(/\\/g, '/')}',
    tsconfig: '${resolve(process.cwd(), 'tsconfig.json').replace(/\\/g, '/')}',
    dtoGlob: '${join(testAppDir, 'src/**/*.dto.ts').replace(/\\/g, '/')}',
  },
  openapi: {
    info: { title: 'Test API', version: '1.0.0' },
  },
});
`;
      writeFileSync(configPath, config, 'utf-8');

      await generate(configPath);

      const content = readFileSync(outputPath, 'utf-8');
      // YAML anchors use & and aliases use *
      // We disabled them with noRefs: true
      expect(content).not.toMatch(/&[a-zA-Z_]/);
      expect(content).not.toMatch(/\*[a-zA-Z_]/);
    });

    it('should produce valid OpenAPI YAML that matches JSON structure', async () => {
      const jsonConfigPath = join(TEST_DIR, 'compare-json.config.ts');
      const yamlConfigPath = join(TEST_DIR, 'compare-yaml.config.ts');
      const jsonOutputPath = join(TEST_DIR, 'compare.json');
      const yamlOutputPath = join(TEST_DIR, 'compare.yaml');

      const baseConfig = (output: string, format: string) => `
import { defineConfig } from '${resolve(process.cwd(), 'src/config.js').replace(/\\/g, '/')}';

export default defineConfig({
  output: '${output.replace(/\\/g, '/')}',
  format: '${format}',
  files: {
    entry: '${join(testAppDir, 'src/app.module.ts').replace(/\\/g, '/')}',
    tsconfig: '${resolve(process.cwd(), 'tsconfig.json').replace(/\\/g, '/')}',
    dtoGlob: '${join(testAppDir, 'src/**/*.dto.ts').replace(/\\/g, '/')}',
  },
  openapi: {
    info: { title: 'Compare API', version: '1.0.0' },
  },
});
`;

      writeFileSync(
        jsonConfigPath,
        baseConfig(jsonOutputPath, 'json'),
        'utf-8',
      );
      writeFileSync(
        yamlConfigPath,
        baseConfig(yamlOutputPath, 'yaml'),
        'utf-8',
      );

      await generate(jsonConfigPath);
      await generate(yamlConfigPath);

      const jsonContent = JSON.parse(readFileSync(jsonOutputPath, 'utf-8'));
      const yamlContent = yaml.load(
        readFileSync(yamlOutputPath, 'utf-8'),
      ) as Record<string, unknown>;

      // Deep equal comparison
      expect(yamlContent).toEqual(jsonContent);
    });
  });

  describe('regressions', () => {
    const configImportPath = resolve(process.cwd(), 'src/config.js').replace(
      /\\/g,
      '/',
    );

    const writeMinimalApp = (
      appDir: string,
      controllerSource: string,
      withTsconfig = true,
    ) => {
      const srcDir = join(appDir, 'src');
      mkdirSync(srcDir, { recursive: true });

      writeFileSync(join(srcDir, 'app.controller.ts'), controllerSource, 'utf-8');
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

      if (withTsconfig) {
        writeFileSync(
          join(appDir, 'tsconfig.json'),
          JSON.stringify(
            {
              compilerOptions: {
                target: 'ES2022',
                module: 'NodeNext',
                moduleResolution: 'NodeNext',
                strict: true,
                skipLibCheck: true,
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
      }
    };

    it('should generate valid refs without explicit dtoGlob', async () => {
      const appDir = join(TEST_DIR, 'missing-dtoglob-app');
      const outputPath = join(appDir, 'openapi.generated.json');
      const configPath = join(TEST_DIR, 'missing-dtoglob.config.ts');

      writeMinimalApp(
        appDir,
        `
import { Controller, Get } from '@nestjs/common';

export class UserDto {
  id!: string;
}

@Controller('users')
export class AppController {
  @Get()
  getUser(): UserDto {
    return { id: '1' };
  }
}
`,
      );

      const config = `import { defineConfig } from '${configImportPath}';

export default defineConfig({
  output: '${outputPath.replace(/\\/g, '/')}',
  files: {
    entry: '${join(appDir, 'src/app.module.ts').replace(/\\/g, '/')}',
    tsconfig: '${join(appDir, 'tsconfig.json').replace(/\\/g, '/')}',
  },
  openapi: {
    info: { title: 'Missing dtoGlob', version: '1.0.0' },
  },
});
`;
      writeFileSync(configPath, config, 'utf-8');

      const result = await generate(configPath);
      expect(result.validation.valid).toBe(true);
    });

    it('should auto-discover tsconfig from parent directories', async () => {
      const appDir = join(TEST_DIR, 'tsconfig-discovery-app');
      const outputPath = join(appDir, 'openapi.generated.json');
      const configPath = join(TEST_DIR, 'tsconfig-discovery.config.ts');

      writeMinimalApp(
        appDir,
        `
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class AppController {
  @Get()
  health(): string {
    return 'ok';
  }
}
`,
      );

      const config = `import { defineConfig } from '${configImportPath}';

export default defineConfig({
  output: '${outputPath.replace(/\\/g, '/')}',
  files: {
    entry: '${join(appDir, 'src/app.module.ts').replace(/\\/g, '/')}',
  },
  openapi: {
    info: { title: 'tsconfig discovery', version: '1.0.0' },
  },
});
`;
      writeFileSync(configPath, config, 'utf-8');

      const result = await generate(configPath);
      expect(result.outputPath).toBe(outputPath);
    });
  });
});
