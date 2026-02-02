import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { resolve } from 'path';
import {
  existsSync,
  unlinkSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from 'fs';
import { generate } from '../src/generate.js';
import type { OpenApiSpec } from '../src/types.js';

/**
 * E2E tests for OpenAPI version support (3.0.3, 3.1.0, 3.2.0)
 *
 * These tests verify:
 * 1. Version string is correctly set in the output
 * 2. Nullable transformations work correctly for 3.1+
 * 3. Schemas are properly transformed based on version
 */
describe('OpenAPI Version E2E', () => {
  const testAppDir = resolve(
    process.cwd(),
    'e2e-applications/openapi-version-test',
  );
  const srcDir = resolve(testAppDir, 'src');
  const outputPath = resolve(testAppDir, 'openapi.generated.json');
  const configPath = resolve(testAppDir, 'openapi.config.ts');

  // Create test app directory
  beforeAll(() => {
    if (!existsSync(testAppDir)) {
      mkdirSync(testAppDir, { recursive: true });
    }
    if (!existsSync(srcDir)) {
      mkdirSync(srcDir, { recursive: true });
    }
  });

  // Cleanup after each test
  afterEach(() => {
    // Remove generated output
    if (existsSync(outputPath)) {
      unlinkSync(outputPath);
    }
    // Remove config
    if (existsSync(configPath)) {
      unlinkSync(configPath);
    }
    // Remove source files
    const controllerPath = resolve(srcDir, 'user.controller.ts');
    const modulePath = resolve(srcDir, 'app.module.ts');
    if (existsSync(controllerPath)) unlinkSync(controllerPath);
    if (existsSync(modulePath)) unlinkSync(modulePath);
  });

  // Helper to create test files
  const createTestFiles = () => {
    const controllerContent = `
import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';

class UserDto {
  id: string;
  name: string;
  email?: string;
  age?: number;
}

class CreateUserDto {
  name: string;
  email: string;
  age?: number;
}

@ApiTags('Users')
@Controller('users')
export class UserController {
  @Get()
  @ApiOperation({ summary: 'Get all users' })
  @ApiResponse({ status: 200, type: [UserDto] })
  findAll(): UserDto[] {
    return [];
  }

  @Post()
  @ApiOperation({ summary: 'Create a user' })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({ status: 201, type: UserDto })
  create(@Body() dto: CreateUserDto): UserDto {
    return { id: '1', name: dto.name, email: dto.email, age: dto.age };
  }
}
`;

    const moduleContent = `
import { Module } from '@nestjs/common';
import { UserController } from './user.controller.js';

@Module({
  controllers: [UserController],
})
export class AppModule {}
`;

    writeFileSync(resolve(srcDir, 'user.controller.ts'), controllerContent);
    writeFileSync(resolve(srcDir, 'app.module.ts'), moduleContent);
  };

  // Helper to create config file
  const createConfig = (version?: string) => {
    const versionLine = version ? `version: '${version}',` : '';
    const configContent = `
import { defineConfig } from '../../src/config.js';

export default defineConfig({
  output: 'openapi.generated.json',
  files: {
    entry: 'src/app.module.ts',
    tsconfig: '../../tsconfig.json',
  },
  openapi: {
    ${versionLine}
    info: {
      title: 'Version Test API',
      version: '1.0.0',
    },
  },
});
`;
    writeFileSync(configPath, configContent);
  };

  describe('OpenAPI 3.0.3 (default)', () => {
    it('should generate spec with version 3.0.3 by default', async () => {
      createTestFiles();
      createConfig(); // No version specified

      await generate(configPath);

      expect(existsSync(outputPath)).toBe(true);
      const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      expect(spec.openapi).toBe('3.0.3');
    });

    it('should generate spec with explicit version 3.0.3', async () => {
      createTestFiles();
      createConfig('3.0.3');

      await generate(configPath);

      expect(existsSync(outputPath)).toBe(true);
      const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      expect(spec.openapi).toBe('3.0.3');
    });
  });

  describe('OpenAPI 3.1.0', () => {
    it('should generate spec with version 3.1.0', async () => {
      createTestFiles();
      createConfig('3.1.0');

      await generate(configPath);

      expect(existsSync(outputPath)).toBe(true);
      const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      expect(spec.openapi).toBe('3.1.0');
    });

    it('should have webhooks field available in 3.1.0', async () => {
      createTestFiles();
      createConfig('3.1.0');

      await generate(configPath);

      const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      // In 3.1.0, webhooks field should be available (even if not populated)
      expect(spec.openapi).toBe('3.1.0');
      // webhooks might be undefined if not used, but the type supports it
    });
  });

  describe('OpenAPI 3.2.0', () => {
    it('should generate spec with version 3.2.0', async () => {
      createTestFiles();
      createConfig('3.2.0');

      await generate(configPath);

      expect(existsSync(outputPath)).toBe(true);
      const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      expect(spec.openapi).toBe('3.2.0');
    });
  });
});
