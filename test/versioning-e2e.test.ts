import { describe, it, expect, afterAll } from 'vitest';
import { resolve } from 'path';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { generate } from '../src/document/generate.js';
import type { OpenApiSpec } from '../src/config/types.js';

/**
 * Versioning, path aliases, @All(), @ApiExtension, @ApiExtraModels and the
 * other operation-level decorators, compared with @nestjs/swagger's output.
 */
describe('Versioning and operation decorators E2E', () => {
  const fixtureDir = resolve(process.cwd(), 'e2e-applications/versioning');
  const variants = ['uri', 'header'] as const;

  const run = async (variant: (typeof variants)[number]) => {
    const result = await generate(resolve(fixtureDir, `openapi.${variant}.config.ts`));
    const spec: OpenApiSpec = JSON.parse(
      readFileSync(resolve(fixtureDir, `openapi.${variant}.generated.json`), 'utf-8'),
    );
    return { result, spec };
  };

  afterAll(() => {
    for (const variant of variants) {
      const outputPath = resolve(fixtureDir, `openapi.${variant}.generated.json`);
      if (existsSync(outputPath)) unlinkSync(outputPath);
    }
  });

  const operationIds = (spec: OpenApiSpec) =>
    Object.fromEntries(
      Object.entries(spec.paths).flatMap(([path, operations]) =>
        Object.entries(operations as Record<string, { operationId: string }>).map(
          ([method, operation]) => [`${method} ${path}`, operation.operationId],
        ),
      ),
    );

  it('prefixes URI versions like Nest, with versioned operationIds', async () => {
    const { result, spec } = await run('uri');

    expect(result.validation.brokenRefs).toEqual([]);
    expect(operationIds(spec)).toEqual({
      'get /cats/neutral': 'CatsController_neutral',
      'get /v1/cats': 'CatsController_list_v1',
      'get /v1/cats/both': 'CatsController_both_v1',
      'get /v2/cats/both': 'CatsController_both_v2',
      'get /v2/cats/{id}': 'CatsController_get_v2',
      'get /v3/birds': 'BirdsController_list[0]_v3',
      'get /v3/birds/all': 'BirdsController_list[1]_v3',
      'get /v3/parrots': 'BirdsController_list[2]_v3',
      'get /v3/parrots/all': 'BirdsController_list[3]_v3',
      'get /v3/dogs': 'DogsController_list_v3',
      'get /v3/dogs/any': 'DogsController_any_get',
      'post /v3/dogs/any': 'DogsController_any_post',
      'put /v3/dogs/any': 'DogsController_any_put',
      'delete /v3/dogs/any': 'DogsController_any_delete',
      'patch /v3/dogs/any': 'DogsController_any_patch',
      'options /v3/dogs/any': 'DogsController_any_options',
      'head /v3/dogs/any': 'DogsController_any_head',
    });
  });

  it('leaves paths alone for header versioning', async () => {
    const { spec } = await run('header');

    expect(Object.keys(spec.paths)).toContain('/cats/{id}');
    expect(spec.paths['/cats']?.get?.operationId).toBe('CatsController_list');
  });

  it('applies controller-level @ApiExtension, method-level winning', async () => {
    const { spec } = await run('header');

    expect(spec.paths['/cats']?.get).toMatchObject({
      'x-team': 'cats-core',
      'x-rate-limit': { perMinute: 60 },
    });
    expect(spec.paths['/cats/both']?.get).toMatchObject({ 'x-team': 'felines' });
  });

  it('merges method @ApiTags with the controller tags and reads deprecated', async () => {
    const { spec } = await run('header');
    const operation = spec.paths['/cats/{id}']?.get;

    expect(operation?.tags).toEqual(['Cats', 'Lookup']);
    expect(operation?.deprecated).toBe(true);
  });

  it('adds @ApiExtraModels schemas and honours @ApiHideProperty', async () => {
    const { spec } = await run('header');

    expect(spec.components?.schemas?.['CatEventDto']).toBeDefined();
    expect(Object.keys(spec.components?.schemas?.['CatDto']?.properties ?? {})).toEqual([
      'name',
    ]);
  });
});
