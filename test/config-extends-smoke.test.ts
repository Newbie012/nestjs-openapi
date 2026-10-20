import { describe, it, expect, afterAll } from 'vitest';
import { generate } from '../src/document/generate.js';
import { resolve } from 'node:path';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';

describe('Config extends smoke', () => {
  const generatedFiles: string[] = [];

  afterAll(() => {
    for (const file of generatedFiles) {
      if (existsSync(file)) {
        unlinkSync(file);
      }
    }
  });

  describe('Config extends support', () => {
    const configPath = resolve(
      process.cwd(),
      'e2e-applications/config-extends/openapi.config.ts',
    );
    const outputPath = resolve(
      process.cwd(),
      'e2e-applications/config-extends/openapi.generated.json',
    );

    it('should merge parent config with child config', async () => {
      generatedFiles.push(outputPath);

      const result = await generate(configPath);

      expect(result.outputPath).toBe(outputPath);
      expect(existsSync(outputPath)).toBe(true);

      const spec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      // Child overrides
      expect(spec.info.title).toBe('Extended API');
      expect(spec.info.version).toBe('2.0.0');

      // Parent values inherited
      expect(spec.info.description).toBe(
        'Base API description from parent config',
      );
      expect(spec.servers).toEqual([{ url: 'https://base.example.com' }]);
    });

    it('should apply inherited basePath', async () => {
      const spec = JSON.parse(readFileSync(outputPath, 'utf-8'));

      // basePath from parent should be applied
      expect(spec.paths).toHaveProperty('/api/v1/app/health');
    });
  });
});
