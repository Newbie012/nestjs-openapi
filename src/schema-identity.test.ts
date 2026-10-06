import { afterAll, describe, it, expect } from 'vitest';
import { Effect, Either } from 'effect';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeclarationRef, MethodInfo } from './domain.js';
import { defaultCollisionNames, planSchemaNames } from './schema-identity.js';

describe('defaultCollisionNames', () => {
  it('prefixes the type name with the file name, without .ts and .dto', () => {
    expect(
      defaultCollisionNames('AddressDto', [
        'src/shipping/shipping.dto.ts',
        'src/orders/dto/get-order-summary.dto.ts',
      ]),
    ).toEqual(['Shipping_AddressDto', 'GetOrderSummary_AddressDto']);
  });

  it('adds parent folders until the prefixes differ', () => {
    expect(
      defaultCollisionNames('PluginStateDto', [
        'libs/a/plugin-state.dto.ts',
        'libs/b/plugin-state.dto.ts',
      ]),
    ).toEqual(['APluginState_PluginStateDto', 'BPluginState_PluginStateDto']);
  });
});

describe('planSchemaNames', () => {
  const dir = mkdtempSync(join(tmpdir(), 'schema-identity-'));
  const fileA = join(dir, 'a.dto.ts');
  const fileB = join(dir, 'b.dto.ts');
  writeFileSync(fileA, 'class Shared {}\nexport class Other {}\n');
  writeFileSync(fileB, 'class Shared {}\n');

  const ref = (filePath: string, name: string): DeclarationRef => ({
    name,
    filePath,
    exported: false,
    kind: 'class',
    topLevel: false,
  });
  const method = (refs: readonly DeclarationRef[]) =>
    ({ referencedDeclarations: refs }) as unknown as MethodInfo;
  const methods = [
    method([ref(fileA, 'Shared'), ref(fileA, 'Other')]),
    method([ref(fileB, 'Shared')]),
  ];

  const plan = (strategy: Parameters<typeof planSchemaNames>[2]) =>
    Effect.runSync(Effect.either(planSchemaNames(methods, [], strategy, dir)));

  it('fails when a naming function returns the same name twice', () => {
    const result = plan(() => 'SameName');

    expect(Either.isLeft(result) && result.left.message).toMatch(
      /returned "SameName" for both Shared in a\.dto\.ts and Shared in b\.dto\.ts/,
    );
  });

  it("fails when a naming function returns another schema's name", () => {
    const result = plan(() => 'Other');

    expect(Either.isLeft(result) && result.left.message).toMatch(
      /already the name of another schema/,
    );
  });

  it('accepts unique names from a naming function', () => {
    const result = plan(({ relativePath }) =>
      relativePath.startsWith('a') ? 'SharedA' : 'SharedB',
    );

    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(
        [...result.right.declarations.values()].map((d) => d.name).sort(),
      ).toEqual(['SharedA', 'SharedB']);
    }
  });

  it('keeps names reached through a single declaration', () => {
    const result = Effect.runSync(
      planSchemaNames(
        [method([ref(fileA, 'Other')])],
        [fileA, fileB],
        'rename',
        dir,
      ),
    );

    expect(result.declarations.size).toBe(0);
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });
});
