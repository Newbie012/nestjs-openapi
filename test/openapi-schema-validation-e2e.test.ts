import { describe, it, expect, afterAll } from 'vitest';
import { resolve, dirname, basename } from 'path';
import { existsSync, unlinkSync, readFileSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { Validator } from '@seriousme/openapi-schema-validator';
import { generate } from '../src/document/generate.js';

/**
 * Every fixture must produce a document that is valid against the official
 * OpenAPI schema, in 3.0 and in 3.1, and generate() must report it valid.
 */
// Fixtures that are not valid OpenAPI on purpose
const EXCLUDED: Readonly<Record<string, string>> = {
  'complex-generics/openapi.raw.config.ts':
    "genericNames: 'raw' keeps `<` and `>`, which component names do not allow",
  'schema-collisions/openapi.error.config.ts':
    "schemaNameCollision: 'error' fails generation on purpose",
};

// From git, since other tests write configs into fixture directories while
// the suite runs
const FIXTURES = execFileSync(
  'git',
  ['ls-files', '--', 'e2e-applications/*/*.config.ts'],
  { encoding: 'utf-8' },
)
  .split('\n')
  .map((file) => file.replace(/^e2e-applications\//, ''))
  .filter((fixture) => fixture !== '' && !(fixture in EXCLUDED))
  .sort();

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
    const configPath = resolve(
      dirname(baseConfig),
      `.validate.${tag}.config.ts`,
    );
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
        const generated = await generate(configPath);
        const document = JSON.parse(readFileSync(outputPath, 'utf-8'));

        const validator = new Validator();
        const result = await validator.validate(document);

        expect(document.openapi).toBe(version);
        expect(result.errors ?? []).toEqual([]);
        expect(result.valid).toBe(true);
        expect(generated.validation.structuralErrors).toEqual([]);
        expect(generated.validation.valid).toBe(true);
      });
    }
  }
});
