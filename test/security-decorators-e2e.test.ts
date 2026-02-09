import { describe, it, expect, afterEach } from 'vitest';
import { resolve } from 'path';
import { existsSync, unlinkSync, readFileSync, writeFileSync } from 'fs';
import { generate } from '../src/generate.js';
import type { OpenApiSpec } from '../src/types.js';

describe('Security Decorators E2E', () => {
  const configPath = resolve(
    process.cwd(),
    'e2e-applications/security-decorators/openapi.config.ts',
  );
  const outputPath = resolve(
    process.cwd(),
    'e2e-applications/security-decorators/openapi.generated.json',
  );
  const mergedConfigPath = resolve(
    process.cwd(),
    'e2e-applications/security-decorators/openapi.global-merge.config.ts',
  );
  const mergedOutputPath = resolve(
    process.cwd(),
    'e2e-applications/security-decorators/openapi.global-merge.generated.json',
  );

  afterEach(() => {
    // Clean up generated file
    if (existsSync(outputPath)) {
      unlinkSync(outputPath);
    }
    if (existsSync(mergedOutputPath)) {
      unlinkSync(mergedOutputPath);
    }
    if (existsSync(mergedConfigPath)) {
      unlinkSync(mergedConfigPath);
    }
  });

  it('should generate OpenAPI spec with security schemes from config', async () => {
    const result = await generate(configPath);

    expect(result.outputPath).toBe(outputPath);
    expect(existsSync(outputPath)).toBe(true);

    const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

    // Verify security schemes from config are present
    expect(spec.components?.securitySchemes).toBeDefined();

    const schemes = spec.components?.securitySchemes;
    expect(schemes?.bearer).toBeDefined();
    expect(schemes?.jwt).toBeDefined();
    expect(schemes?.basic).toBeDefined();
    expect(schemes?.['admin-key']).toBeDefined();
    expect(schemes?.cookie).toBeDefined();
    expect(schemes?.oauth2).toBeDefined();
  });

  describe('Public endpoints (no security decorators)', () => {
    it('should not have per-operation security on public endpoints', async () => {
      await generate(configPath);
      const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      // Public endpoints should NOT have operation-level security
      const healthOp = spec.paths['/public/health']?.get;
      expect(healthOp).toBeDefined();
      expect(healthOp?.security).toBeUndefined();

      const versionOp = spec.paths['/public/version']?.get;
      expect(versionOp).toBeDefined();
      expect(versionOp?.security).toBeUndefined();
    });
  });

  describe('@ApiBearerAuth at controller level', () => {
    it('should apply bearer security to all methods in BearerController', async () => {
      await generate(configPath);
      const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      // All endpoints in /users should have bearer security
      const findAllOp = spec.paths['/users']?.get;
      expect(findAllOp?.security).toBeDefined();
      expect(findAllOp?.security).toEqual([{ bearer: [] }]);

      const findOneOp = spec.paths['/users/{id}']?.get;
      expect(findOneOp?.security).toBeDefined();
      expect(findOneOp?.security).toEqual([{ bearer: [] }]);

      const createOp = spec.paths['/users']?.post;
      expect(createOp?.security).toBeDefined();
      expect(createOp?.security).toEqual([{ bearer: [] }]);
    });
  });

  describe('Mixed security decorators per method', () => {
    it('should have no security on public method', async () => {
      await generate(configPath);
      const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      // GET /articles has no security decorator
      const findAllOp = spec.paths['/articles']?.get;
      expect(findAllOp).toBeDefined();
      expect(findAllOp?.security).toBeUndefined();
    });

    it('should have JWT security on bearer-protected method', async () => {
      await generate(configPath);
      const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      // GET /articles/:id uses @ApiBearerAuth('jwt')
      const findOneOp = spec.paths['/articles/{id}']?.get;
      expect(findOneOp?.security).toEqual([{ jwt: [] }]);
    });

    it('should have basic auth on basic-protected method', async () => {
      await generate(configPath);
      const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      // POST /articles uses @ApiBasicAuth()
      const createOp = spec.paths['/articles']?.post;
      expect(createOp?.security).toEqual([{ basic: [] }]);
    });

    it('should have api-key security on admin method', async () => {
      await generate(configPath);
      const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      // DELETE /articles/:id uses @ApiSecurity('admin-key')
      const deleteOp = spec.paths['/articles/{id}']?.delete;
      expect(deleteOp?.security).toEqual([{ 'admin-key': [] }]);
    });

    it('should have cookie auth on preview method', async () => {
      await generate(configPath);
      const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      // GET /articles/:id/preview uses @ApiCookieAuth()
      const previewOp = spec.paths['/articles/{id}/preview']?.get;
      expect(previewOp?.security).toEqual([{ cookie: [] }]);
    });
  });

  describe('@ApiOAuth2 with scopes', () => {
    it('should apply controller-level OAuth2 scopes to methods without overrides', async () => {
      await generate(configPath);
      const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      // GET /projects inherits @ApiOAuth2(['read:projects']) from controller
      const findAllOp = spec.paths['/projects']?.get;
      expect(findAllOp?.security).toEqual([{ oauth2: ['read:projects'] }]);

      const findOneOp = spec.paths['/projects/{id}']?.get;
      expect(findOneOp?.security).toEqual([{ oauth2: ['read:projects'] }]);
    });

    it('should use method-level OAuth2 scopes when specified', async () => {
      await generate(configPath);
      const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      // POST /projects has @ApiOAuth2(['read:projects', 'write:projects'])
      const createOp = spec.paths['/projects']?.post;
      expect(createOp?.security).toEqual([
        { oauth2: ['read:projects', 'write:projects'] },
      ]);

      // PUT /projects/:id has @ApiOAuth2(['write:projects'])
      const updateOp = spec.paths['/projects/{id}']?.put;
      expect(updateOp?.security).toEqual([{ oauth2: ['write:projects'] }]);

      // DELETE /projects/:id has @ApiOAuth2(['delete:projects'])
      const deleteOp = spec.paths['/projects/{id}']?.delete;
      expect(deleteOp?.security).toEqual([{ oauth2: ['delete:projects'] }]);
    });
  });

  describe('Multiple security decorators (AND logic)', () => {
    it('should combine multiple controller-level security decorators', async () => {
      await generate(configPath);
      const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      // AdminController has both @ApiBearerAuth('jwt') and @ApiSecurity('admin-key')
      const actionsOp = spec.paths['/admin/actions']?.get;
      expect(actionsOp?.security).toBeDefined();
      // Both should be required (AND logic)
      const security = actionsOp?.security?.[0];
      expect(security).toHaveProperty('jwt');
      expect(security).toHaveProperty('admin-key');
    });

    it('should allow method to override controller security', async () => {
      await generate(configPath);
      const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      // GET /admin/public-stats has only @ApiSecurity('stats-key'), overriding controller
      const statsOp = spec.paths['/admin/public-stats']?.get;
      expect(statsOp?.security).toEqual([{ 'stats-key': [] }]);
    });
  });

  describe('Path and operation structure', () => {
    it('should generate all expected paths', async () => {
      const result = await generate(configPath);
      const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      // Check path count
      expect(result.pathCount).toBeGreaterThan(0);

      // Verify key paths exist
      expect(spec.paths['/public/health']).toBeDefined();
      expect(spec.paths['/users']).toBeDefined();
      expect(spec.paths['/articles']).toBeDefined();
      expect(spec.paths['/projects']).toBeDefined();
      expect(spec.paths['/admin/actions']).toBeDefined();
    });

    it('should have correct tags from @ApiTags decorator', async () => {
      await generate(configPath);
      const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      expect(spec.paths['/public/health']?.get?.tags).toContain('Public');
      expect(spec.paths['/users']?.get?.tags).toContain('Users');
      expect(spec.paths['/articles']?.get?.tags).toContain('Articles');
      expect(spec.paths['/projects']?.get?.tags).toContain('Projects');
      expect(spec.paths['/admin/actions']?.get?.tags).toContain('Admin');
    });
  });

  describe('Global + decorator merge semantics', () => {
    it('should preserve global OR alternatives when merging with operation security', async () => {
      writeFileSync(
        mergedConfigPath,
        `
import { defineConfig } from '../../src/config.js';

export default defineConfig({
  output: 'openapi.global-merge.generated.json',
  files: {
    entry: 'src/app.module.ts',
    tsconfig: '../../tsconfig.json',
    dtoGlob: 'src/**/*.ts',
  },
  openapi: {
    info: {
      title: 'Security Merge API',
      version: '1.0.0',
    },
    security: {
      schemes: [
        { name: 'bearer', type: 'http', scheme: 'bearer' },
        { name: 'apiKey', type: 'apiKey', in: 'header', parameterName: 'X-API-Key' },
        { name: 'admin-key', type: 'apiKey', in: 'header', parameterName: 'X-Admin-Key' },
      ],
      global: [{ bearer: [] }, { apiKey: [] }],
    },
  },
});
`,
      );

      await generate(mergedConfigPath);

      const spec: OpenApiSpec = JSON.parse(
        readFileSync(mergedOutputPath, 'utf-8'),
      );

      const deleteOp = spec.paths['/articles/{id}']?.delete;
      expect(deleteOp?.security).toEqual([
        { bearer: [], 'admin-key': [] },
        { apiKey: [], 'admin-key': [] },
      ]);
    });
  });
});
