import { afterAll, describe, it, expect } from 'vitest';
import { Effect, Either } from 'effect';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeclarationRef, MethodInfo } from '../model/domain.js';
import {
  defaultCollisionNames,
  nameDeclarations,
  planSchemaNames,
} from './schema-identity.js';

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

  it('gives a declaration renamed by schemaName its new name', () => {
    const plan = planSchemaNames(
      [method([ref(fileA, 'Other')])],
      [],
      dir,
      new Map([[`${fileA}::Other`, 'Renamed']]),
    );

    expect(
      [...plan.declarations.values()].map((declaration) => declaration.name),
    ).toEqual(['Renamed']);
    expect(plan.shared.size).toBe(0);
  });

  it('shares a name between declarations schemaName gives the same name', () => {
    const plan = planSchemaNames(
      [method([ref(fileA, 'Other'), ref(fileB, 'Shared')])],
      [],
      dir,
      new Map([[`${fileA}::Other`, 'Shared']]),
    );

    expect(
      [...plan.shared.values()].map((entry) => [
        entry.name,
        entry.declaredName,
        entry.relativePath,
      ]),
    ).toEqual([
      ['Shared', 'Other', 'a.dto.ts'],
      ['Shared', 'Shared', 'b.dto.ts'],
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

describe('nameDeclarations', () => {
  const methods = [
    {
      referencedDeclarations: [
        {
          name: 'UserDto',
          filePath: '/app/src/public/user.dto.ts',
          exported: true,
          kind: 'class',
          topLevel: true,
        },
        {
          name: 'Role',
          filePath: '/app/src/public/role.enum.ts',
          exported: true,
          kind: 'enum',
          topLevel: false,
        },
      ],
    },
  ] as unknown as MethodInfo[];

  const run = (hook: Parameters<typeof nameDeclarations>[2]) =>
    Effect.runSync(Effect.either(nameDeclarations(methods, '/app', hook)));
  const failure = (result: ReturnType<typeof run>) =>
    Either.isLeft(result) ? result.left : undefined;

  it('passes each declaration with its path relative to the config file', () => {
    const inputs: unknown[] = [];
    run((input) => {
      inputs.push(input);
      return input.name;
    });

    expect(inputs).toEqual([
      {
        name: 'UserDto',
        kind: 'class',
        filePath: '/app/src/public/user.dto.ts',
        relativePath: 'src/public/user.dto.ts',
        exported: true,
      },
      {
        name: 'Role',
        kind: 'enum',
        filePath: '/app/src/public/role.enum.ts',
        relativePath: 'src/public/role.enum.ts',
        exported: true,
      },
    ]);
  });

  it('lists only the declarations it renames', () => {
    const result = run(({ name }) => name.replace(/Dto$/, ''));

    expect(Either.getOrThrow(result)).toEqual(
      new Map([['/app/src/public/user.dto.ts::UserDto', 'User']]),
    );
  });

  it.each([[''], ['user-dto'], ['1User'], [undefined]])(
    'fails when the name returned is %j',
    (returned) => {
      const result = run(() => returned as unknown as string);

      expect(failure(result)?._tag).toBe('SchemaNameError');
    },
  );

  it('fails with the thrown message when the hook throws', () => {
    const result = run(() => {
      throw new Error('boom');
    });

    expect(failure(result)?.message).toMatch(
      /options\.schemaName threw for UserDto in src\/public\/user\.dto\.ts: boom/,
    );
  });
});
