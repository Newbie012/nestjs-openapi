import { describe, it, expect, afterEach } from 'vitest';
import { resolve } from 'path';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { generate } from '../src/generate.js';
import type { OpenApiSpec } from '../src/types.js';

describe('Security schemes E2E', () => {
  const configPath = resolve(
    process.cwd(),
    'e2e-applications/auth-security/openapi.config.ts',
  );
  const outputPath = resolve(
    process.cwd(),
    'e2e-applications/auth-security/openapi.generated.json',
  );

  afterEach(() => {
    // Clean up generated file
    if (existsSync(outputPath)) {
      unlinkSync(outputPath);
    }
  });

  it('should generate OpenAPI spec with security schemes', async () => {
    const result = await generate(configPath);

    expect(result.outputPath).toBe(outputPath);
    expect(existsSync(outputPath)).toBe(true);

    const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

    // Verify basic spec structure
    expect(spec.openapi).toBe('3.0.3');
    expect(spec.info.title).toBe('Auth Security API');
    expect(spec.info.version).toBe('1.0.0');

    // Verify security schemes are present
    expect(spec.components).toBeDefined();
    expect(spec.components?.securitySchemes).toBeDefined();

    const securitySchemes = spec.components?.securitySchemes;

    // Verify bearerAuth scheme
    expect(securitySchemes?.bearerAuth).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'JWT Bearer token authentication',
    });

    // Verify apiKey scheme
    expect(securitySchemes?.apiKey).toEqual({
      type: 'apiKey',
      in: 'header',
      name: 'X-API-Key',
      description: 'API key authentication',
    });

    // Verify global security requirements
    expect(spec.security).toBeDefined();
    expect(spec.security).toEqual([{ bearerAuth: [] }]);
  });

  it('should include paths from the auth controller', async () => {
    await generate(configPath);

    const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

    // Verify paths exist
    expect(spec.paths['/auth/login']).toBeDefined();
    expect(spec.paths['/auth/profile']).toBeDefined();
    expect(spec.paths['/auth/refresh']).toBeDefined();

    // Verify operations
    expect(spec.paths['/auth/login'].post).toBeDefined();
    expect(spec.paths['/auth/profile'].get).toBeDefined();
    expect(spec.paths['/auth/refresh'].post).toBeDefined();
  });

  it('should have correct operation metadata', async () => {
    await generate(configPath);

    const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

    const loginOp = spec.paths['/auth/login'].post;
    expect(loginOp.summary).toBe('Authenticate user and get tokens');
    expect(loginOp.tags).toContain('Authentication');

    const profileOp = spec.paths['/auth/profile'].get;
    expect(profileOp.summary).toBe(
      'Get current user profile (requires authentication)',
    );
  });
});
