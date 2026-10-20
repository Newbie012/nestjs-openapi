import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Project } from 'ts-morph';
import {
  resolveTypeLocations,
  resolveTypeLocationsFast,
} from './type-resolver.js';

const dirs: string[] = [];

const createDir = (files: Readonly<Record<string, string>>) => {
  const dir = mkdtempSync(join(tmpdir(), 'nestjs-openapi-type-resolver-'));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), content, 'utf-8');
  }
  return dir;
};

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const SOURCES = {
  'src/user.dto.ts':
    'export class UserDto { id!: string }\nexport class Page<T> { items!: T[] }\n',
  'src/shapes.ts':
    'export interface Shape {}\nexport type Id = string;\nexport enum Role { A = "a" }\nclass Hidden {}\n',
  'node_modules/lib/index.ts': 'export class LibDto {}\n',
};

describe('resolveTypeLocations', () => {
  const project = (dir: string) => {
    const p = new Project({ skipAddingFilesFromTsConfig: true });
    p.addSourceFilesAtPaths(join(dir, '**/*.ts'));
    return p;
  };

  it('finds exported classes, interfaces, type aliases and enums, with generics stripped', () => {
    const dir = createDir(SOURCES);

    const resolved = resolveTypeLocations(
      project(dir),
      new Set(['UserDto', 'Shape', 'Id', 'Role', 'Page<UserDto>', 'Hidden']),
    );

    expect([...resolved.keys()].sort()).toEqual([
      'Id',
      'Page<UserDto>',
      'Role',
      'Shape',
      'UserDto',
    ]);
  });

  it('leaves out types declared in node_modules', () => {
    const dir = createDir(SOURCES);

    expect(resolveTypeLocations(project(dir), new Set(['LibDto'])).size).toBe(
      0,
    );
  });
});

describe('resolveTypeLocationsFast', () => {
  it('finds exported declarations by searching the file contents, generics stripped', () => {
    const dir = createDir(SOURCES);

    const resolved = resolveTypeLocationsFast(
      dir,
      new Set(['UserDto', 'Role', 'Page<UserDto>']),
    );

    expect(resolved.get('UserDto')).toBe(join(dir, 'src/user.dto.ts'));
    expect(resolved.get('Role')).toBe(join(dir, 'src/shapes.ts'));
    expect(resolved.get('Page')).toBe(join(dir, 'src/user.dto.ts'));
  });

  it('skips node_modules and returns what it found when nothing matches', () => {
    const dir = createDir(SOURCES);

    expect(resolveTypeLocationsFast(dir, new Set(['LibDto'])).size).toBe(0);
    expect(resolveTypeLocationsFast(dir, new Set(['Nope'])).size).toBe(0);
  });
});
