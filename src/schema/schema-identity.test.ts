import { afterAll, describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeclarationRef, MethodInfo } from '../model/domain.js';
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

  it('generates each same-name declaration under a temporary name', () => {
    const plan = planSchemaNames(
      [
        method([ref(fileA, 'Shared'), ref(fileA, 'Other')]),
        method([ref(fileB, 'Shared')]),
      ],
      [],
      dir,
    );

    expect(
      [...plan.declarations.values()].map((declaration) => declaration.name),
    ).toEqual(['Shared__oapiShared0', 'Shared__oapiShared1']);
    expect(
      [...plan.shared.values()].map((entry) => [
        entry.name,
        entry.relativePath,
      ]),
    ).toEqual([
      ['Shared', 'a.dto.ts'],
      ['Shared', 'b.dto.ts'],
    ]);
  });

  it('keeps names reached through a single declaration', () => {
    const plan = planSchemaNames(
      [method([ref(fileA, 'Other')])],
      [fileA, fileB],
      dir,
    );

    expect(plan.declarations.size).toBe(0);
    expect(plan.shared.size).toBe(0);
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });
});
