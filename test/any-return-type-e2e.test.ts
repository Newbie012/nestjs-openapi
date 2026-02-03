import { describe, it, expect, afterAll } from 'vitest';
import { generate } from '../src/generate.js';
import { resolve } from 'node:path';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';

describe('Any Return Type E2E', () => {
  const configPath = resolve(
    process.cwd(),
    'e2e-applications/any-return-type/openapi.config.ts',
  );
  const outputPath = resolve(
    process.cwd(),
    'e2e-applications/any-return-type/openapi.generated.json',
  );

  afterAll(() => {
    if (existsSync(outputPath)) {
      unlinkSync(outputPath);
    }
  });

  it('should include response schema for methods returning any', async () => {
    await generate(configPath);

    const spec = JSON.parse(readFileSync(outputPath, 'utf-8'));

    // Methods returning `any` should still have a response body
    // This proves the bug: currently `any` is treated as non-meaningful
    // and response schemas are omitted
    expect(spec.paths['/test/any-return'].get.responses['200']).toBeDefined();
    expect(
      spec.paths['/test/any-return'].get.responses['200'].content,
    ).toBeDefined();
    expect(
      spec.paths['/test/any-return'].get.responses['200'].content[
        'application/json'
      ],
    ).toBeDefined();
    expect(
      spec.paths['/test/any-return'].get.responses['200'].content[
        'application/json'
      ].schema,
    ).toBeDefined();

    // Same for Promise<any>
    expect(
      spec.paths['/test/promise-any-return'].get.responses['200'],
    ).toBeDefined();
    expect(
      spec.paths['/test/promise-any-return'].get.responses['200'].content,
    ).toBeDefined();
  });

  it('should NOT include response body for methods returning void', async () => {
    const spec = JSON.parse(readFileSync(outputPath, 'utf-8'));

    // Methods returning `void` should NOT have a response body (just description)
    expect(spec.paths['/test/void-return'].get.responses['200']).toBeDefined();
    expect(
      spec.paths['/test/void-return'].get.responses['200'].content,
    ).toBeUndefined();
  });

  it('should include response schema for methods returning specific types', async () => {
    const spec = JSON.parse(readFileSync(outputPath, 'utf-8'));

    // Methods returning `string` should have response body
    expect(
      spec.paths['/test/string-return'].get.responses['200'],
    ).toBeDefined();
    expect(
      spec.paths['/test/string-return'].get.responses['200'].content,
    ).toBeDefined();
  });
});
