import { describe, it, expect, afterAll } from 'vitest';
import { resolve } from 'path';
import { existsSync, unlinkSync } from 'fs';
import { Effect, Logger } from 'effect';
import { generate, generateEffect } from '../src/document/generate.js';
import { generatorServicesLayer } from '../src/runtime/service-layer.js';
import { generateNamedSchemas } from '../src/schema/schema-generator.js';

/**
 * The checks of the naming and component e2e tests that are not about the
 * document: error messages, logged warnings and a lower-level generator call.
 * The documents themselves are pinned in test/contract/naming and
 * test/contract/components.
 */
describe('Naming diagnostics E2E', () => {
  const fixture = (name: string) =>
    resolve(process.cwd(), 'e2e-applications', name);
  const outputs: string[] = [];

  afterAll(() => {
    for (const outputPath of outputs) {
      if (existsSync(outputPath)) unlinkSync(outputPath);
    }
  });

  const generateWarnings = async (name: string, config: string) => {
    const warnings: string[] = [];
    const logger = Logger.make(({ logLevel, message }) => {
      if (logLevel._tag === 'Warning') warnings.push(String(message));
    });
    outputs.push(resolve(fixture(name), 'openapi.generated.json'));
    await Effect.runPromise(
      generateEffect(resolve(fixture(name), config)).pipe(
        Effect.provide(generatorServicesLayer),
        Effect.provide(Logger.replace(Logger.defaultLogger, logger)),
      ) as Effect.Effect<unknown>,
    );
    return warnings.join('\n');
  };

  it("schemaNameCollision 'error' lists every colliding name and its files", async () => {
    await expect(
      generate(
        resolve(fixture('schema-collisions'), 'openapi.error.config.ts'),
      ),
    ).rejects.toThrow(
      /AddressDto: src\/orders\/dto\/get-order-summary\.dto\.ts, src\/shipping\/shipping\.dto\.ts[\s\S]*PluginStateDto: src\/plugins\/a\/plugin-state\.dto\.ts, src\/plugins\/b\/plugin-state\.dto\.ts/,
    );
  });

  it("schemaNameCollision 'error' says how each different schema differs", async () => {
    await expect(
      generate(
        resolve(fixture('schema-same-shapes'), 'openapi.error.config.ts'),
      ),
    ).rejects.toThrow(
      [
        'Different schemas share a name:',
        '  ItemDto: src/inventory/item.dto.ts, src/inventory/shelf.dto.ts',
        '    differ at properties.shelf, properties.sku, required[0]',
        '  NoteDto: src/notes/a/note.dto.ts, src/notes/b/note.dto.ts',
        '    differ at properties.text.description',
        '  ResultDto<string>: src/reports/a/report.dto.ts, src/reports/b/report.dto.ts',
        '    differ at properties.error',
        '  RowDto: src/reports/a/report.dto.ts, src/reports/b/report.dto.ts',
        '    differ at properties.total, required',
        '  SectionDto: src/reports/a/report.dto.ts, src/reports/b/report.dto.ts',
        '    differ at properties.rows.items (RowDto differs)',
        '  PriorityDto (enumName): "low", "high" | "low", "medium", "high"',
      ].join('\n'),
    );
  });

  it('logs no generation failure for the fallback-naming fixture', async () => {
    const warnings = await generateWarnings(
      'fallback-naming',
      'openapi.config.ts',
    );

    expect(warnings).not.toMatch(/Could not generate/);
  });

  it('generates a non-exported interface by name', async () => {
    const result = await Effect.runPromise(
      generateNamedSchemas(
        new Map([
          [
            'WeightedScoreDto',
            resolve(
              fixture('fallback-naming'),
              'src/catalog/dto/product-review.dto.ts',
            ),
          ],
        ]),
        resolve(process.cwd(), 'e2e-applications/tsconfig.json'),
      ),
    );

    expect(result.definitions['WeightedScoreDto']).toMatchObject({
      type: 'object',
      properties: { score: { type: 'number' } },
    });
  });

  it('warns about neither UserProfile nor static enum reads in the regressions fixture', async () => {
    const warnings = await generateWarnings('regressions', 'openapi.config.ts');

    expect(warnings).not.toContain('UserProfile');
    expect(warnings).not.toContain('statically');
  });
});
