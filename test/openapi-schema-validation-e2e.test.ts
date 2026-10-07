import { describe, it, expect, afterAll } from 'vitest';
import { resolve, dirname, basename } from 'path';
import { existsSync, unlinkSync, readFileSync, writeFileSync } from 'fs';
import { Validator } from '@seriousme/openapi-schema-validator';
import { generate } from '../src/document/generate.js';

/**
 * Every feature must produce a document that is valid against the official
 * OpenAPI schema, in 3.0 and in 3.1.
 */
const FIXTURES = [
  'swagger-fidelity/openapi.config.ts',
  'schema-collisions/openapi.inline.config.ts',
  'schema-collisions/openapi.rename.config.ts',
  'versioning/openapi.uri.config.ts',
  'module-scope/openapi.all.config.ts',
  'path-transform/openapi.config.ts',
  'api-property-enum/openapi.config.ts',
  'monolith-todo-app/openapi.config.ts',
] as const;

const VERSIONS = ['3.0.3', '3.1.0'] as const;

describe('OpenAPI schema validation E2E', () => {
  const created: string[] = [];

  afterAll(() => {
    for (const file of created) {
      if (existsSync(file)) unlinkSync(file);
    }
  });

  /** A config extending the fixture's, emitting the given OpenAPI version */
  const configFor = (fixture: string, version: string) => {
    const baseConfig = resolve(process.cwd(), 'e2e-applications', fixture);
    const tag = `${basename(fixture, '.config.ts').replace(/\W/g, '-')}-${version.replace(/\./g, '')}`;
    const configPath = resolve(dirname(baseConfig), `.validate.${tag}.config.ts`);
    const outputPath = resolve(dirname(baseConfig), `.validate.${tag}.json`);
    const base = JSON.stringify(`./${basename(baseConfig)}`);
    writeFileSync(
      configPath,
      [
        "import { defineConfig } from '../../src/config/config.js';",
        'export default defineConfig({',
        `  extends: ${base},`,
        `  output: ${JSON.stringify(basename(outputPath))},`,
        `  openapi: { version: '${version}', info: { title: 'Validation', version: '1.0.0' } },`,
        '});',
        '',
      ].join('\n'),
    );
    created.push(configPath, outputPath);
    return { configPath, outputPath };
  };

  for (const fixture of FIXTURES) {
    for (const version of VERSIONS) {
      it(`${fixture} is a valid OpenAPI ${version} document`, async () => {
        const { configPath, outputPath } = configFor(fixture, version);
        await generate(configPath);
        const document = JSON.parse(readFileSync(outputPath, 'utf-8'));

        const validator = new Validator();
        const result = await validator.validate(document);

        expect(document.openapi).toBe(version);
        expect(result.errors ?? []).toEqual([]);
        expect(result.valid).toBe(true);
      });
    }
  }
});
