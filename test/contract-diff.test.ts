import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diffContracts, renderReport } from '../scripts/contract-diff.js';

const roots: string[] = [];

const makeSide = (documents: Record<string, unknown>): Map<string, string> => {
  const root = mkdtempSync(join(tmpdir(), 'contract-diff-'));
  roots.push(root);
  const side = new Map<string, string>();
  for (const [name, value] of Object.entries(documents)) {
    const dir = join(root, 'test/contract/paths/__contracts__');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, name);
    writeFileSync(file, JSON.stringify(value));
    side.set(`test/contract/paths/__contracts__/${name}`, file);
  }
  return side;
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true });
});

describe('contract diff report', () => {
  it('reports a document the baseline did not produce', () => {
    const head = makeSide({ 'a.3.1.0.json': { x: 1 } });
    const result = diffContracts(head, makeSide({}));
    expect(result.diffs.map((d) => d.status)).toEqual(['not produced']);
    const report = renderReport('v1.0.0', result);
    expect(report).toContain('1 not produced by v1.0.0');
    expect(report).toContain('Document not produced by v1.0.0.');
  });

  it('reports a document only the baseline produced as removed', () => {
    const base = makeSide({ 'a.3.1.0.json': { x: 1 } });
    const result = diffContracts(makeSide({}), base);
    expect(result.diffs.map((d) => d.status)).toEqual(['removed']);
    expect(renderReport('v1.0.0', result)).toContain('1 removed');
  });

  it('lists changed JSON paths and stays quiet when nothing changed', () => {
    const head = makeSide({ 'a.3.1.0.json': { info: { title: 'new' } } });
    const base = makeSide({ 'a.3.1.0.json': { info: { title: 'old' } } });
    const report = renderReport('v1.0.0', diffContracts(head, base));
    expect(report).toContain('`/info/title`: `"old"` → `"new"`');
    const same = diffContracts(head, head);
    expect(renderReport('v1.0.0', same)).toContain('No output changes.');
  });
});
