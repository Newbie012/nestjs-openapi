import { describe, it, expect, afterAll } from 'vitest';
import { resolve } from 'path';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { generate } from '../src/document/generate.js';
import type { OpenApiSpec } from '../src/config/types.js';

describe('transformPath E2E', () => {
  const fixtureDir = resolve(process.cwd(), 'e2e-applications/path-transform');
  const outputPath = resolve(fixtureDir, 'openapi.generated.json');

  afterAll(() => {
    if (existsSync(outputPath)) unlinkSync(outputPath);
  });

  it('rewrites paths with the operation context and keeps servers', async () => {
    await generate(resolve(fixtureDir, 'openapi.config.ts'));
    const spec: OpenApiSpec = JSON.parse(readFileSync(outputPath, 'utf-8'));

    expect(Object.keys(spec.paths).sort()).toEqual([
      '/health',
      '/v1/audit-logs',
      '/v1/audit-logs/{id}',
    ]);
    expect(spec.servers).toEqual([{ url: 'https://app.example.com/api' }]);
    expect(spec.paths['/v1/audit-logs/{id}']?.get?.parameters?.[0]?.name).toBe('id');
  });
});
