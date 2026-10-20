import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const BASELINE = join(ROOT, '.contract-baseline');
const MARKER = '<!-- contract-diff -->';
const MAX_PATHS = 20;
const MAX_FILES = 50;
const MAX_VALUE = 120;

interface Change {
  readonly path: string;
  readonly before: string;
  readonly after: string;
}

interface FileDiff {
  readonly file: string;
  readonly status: 'not produced' | 'removed' | 'changed';
  readonly changes: ReadonlyArray<Change>;
}

const run = (
  command: string,
  args: ReadonlyArray<string>,
  cwd: string = ROOT,
  env: Readonly<Record<string, string>> = {},
): { ok: boolean; stdout: string; output: string } => {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? '',
    output: `${result.stdout ?? ''}${result.stderr ?? ''}${result.error?.message ?? ''}`,
  };
};

/** Parses `--base <ref>` and `--out <file>`; returns an error message on a bad argument */
const parseArgs = (
  argv: ReadonlyArray<string>,
): { base?: string; out: string } | { error: string } => {
  let base: string | undefined;
  let out = 'contract-diff.md';
  for (let i = 0; i < argv.length; i += 2) {
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      return { error: `Missing value for ${argv[i]}` };
    }
    if (argv[i] === '--base') base = value;
    else if (argv[i] === '--out') out = value;
    else return { error: `Unknown argument ${argv[i]}` };
  }
  return { base, out };
};

/** The newest release tag reachable from `origin/main`, falling back to `main` */
const lastRelease = (): string | undefined => {
  for (const branch of ['origin/main', 'main']) {
    const described = run('git', [
      'describe',
      '--tags',
      '--abbrev=0',
      '--match',
      'v*',
      branch,
    ]);
    if (described.ok) return described.stdout.trim();
  }
  return undefined;
};

const removeBaseline = (): void => {
  run('git', ['worktree', 'remove', '--force', BASELINE]);
  rmSync(BASELINE, { recursive: true, force: true });
  run('git', ['worktree', 'prune']);
};

const copyFolder = (folder: string): void => {
  const target = join(BASELINE, folder);
  rmSync(target, { recursive: true, force: true });
  cpSync(join(ROOT, folder), target, {
    recursive: true,
    filter: (source) => !source.split(sep).includes('node_modules'),
  });
};

const removeContracts = (dir: string): void => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = join(dir, entry.name);
    if (entry.name === '__contracts__') {
      rmSync(full, { recursive: true, force: true });
    } else {
      removeContracts(full);
    }
  }
};

const firstLine = (output: string): string =>
  output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .find((line) => /error/i.test(line)) ??
  output.split('\n').find((line) => line.trim().length > 0) ??
  'unknown error';

const findContracts = (root: string): Map<string, string> => {
  const found = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (
        entry.name.endsWith('.json') &&
        full.split(sep).includes('__contracts__')
      ) {
        found.set(relative(root, full).split(sep).join('/'), full);
      }
    }
  };
  const contractRoot = join(root, 'test/contract');
  if (existsSync(contractRoot)) walk(contractRoot);
  return found;
};

const escapePointer = (key: string): string =>
  key.replaceAll('~', '~0').replaceAll('/', '~1');

const compact = (value: unknown): string => {
  const text = value === undefined ? 'undefined' : JSON.stringify(value);
  return text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE - 1)}…` : text;
};

const isContainer = (value: unknown): value is object =>
  typeof value === 'object' && value !== null;

/** Lists the JSON pointers whose leaf value was added, removed or changed */
const diffJson = (
  before: unknown,
  after: unknown,
  path: string = '',
): Change[] => {
  if (isContainer(before) && isContainer(after)) {
    const beforeRecord = before as Record<string, unknown>;
    const afterRecord = after as Record<string, unknown>;
    if (Array.isArray(before) !== Array.isArray(after)) {
      return [{ path, before: compact(before), after: compact(after) }];
    }
    const keys = new Set([
      ...Object.keys(beforeRecord),
      ...Object.keys(afterRecord),
    ]);
    return [...keys].flatMap((key) =>
      diffJson(
        beforeRecord[key],
        afterRecord[key],
        `${path}/${escapePointer(key)}`,
      ),
    );
  }
  return Object.is(before, after) ||
    (before !== undefined && JSON.stringify(before) === JSON.stringify(after))
    ? []
    : [{ path: path || '/', before: compact(before), after: compact(after) }];
};

const readJson = (file: string): unknown =>
  JSON.parse(readFileSync(file, 'utf8'));

export const diffContracts = (
  current: Map<string, string>,
  baseline: Map<string, string>,
): { diffs: FileDiff[]; total: number } => {
  const files = [...new Set([...current.keys(), ...baseline.keys()])].sort();
  const diffs: FileDiff[] = [];
  for (const file of files) {
    const now = current.get(file);
    const then = baseline.get(file);
    if (now && !then) diffs.push({ file, status: 'not produced', changes: [] });
    else if (!now && then) diffs.push({ file, status: 'removed', changes: [] });
    else if (now && then) {
      const changes = diffJson(readJson(then), readJson(now));
      if (changes.length > 0) diffs.push({ file, status: 'changed', changes });
    }
  }
  return { diffs, total: files.length };
};

const caseAndVersion = (file: string): { name: string; version: string } => {
  const base = file.slice(file.lastIndexOf('/') + 1).replace(/\.json$/, '');
  const dot = base.search(/\.\d+\.\d+\.\d+$/);
  return dot === -1
    ? { name: base, version: '' }
    : { name: base.slice(0, dot), version: base.slice(dot + 1) };
};

export const renderReport = (
  ref: string,
  { diffs, total }: { diffs: FileDiff[]; total: number },
): string => {
  const lines = [MARKER, `## Generated output vs ${ref}`, ''];
  if (diffs.length === 0) {
    lines.push('No output changes.');
    return lines.join('\n');
  }
  const changed = diffs.filter((diff) => diff.status === 'changed').length;
  const notProduced = diffs.filter((d) => d.status === 'not produced').length;
  const removed = diffs.filter((diff) => diff.status === 'removed').length;
  const parts = [`${changed} of ${total} documents changed`];
  if (notProduced > 0) parts.push(`${notProduced} not produced by ${ref}`);
  if (removed > 0) parts.push(`${removed} removed`);
  lines.push(parts.join(', '), '');
  lines.push('| Case | Version | Changed paths |', '| --- | --- | --- |');
  for (const diff of diffs.slice(0, MAX_FILES)) {
    const { name, version } = caseAndVersion(diff.file);
    const count =
      diff.status === 'changed' ? `${diff.changes.length}` : diff.status;
    lines.push(`| ${name} | ${version} | ${count} |`);
  }
  if (diffs.length > MAX_FILES) {
    lines.push('', `…and ${diffs.length - MAX_FILES} more documents`);
  }
  for (const diff of diffs.slice(0, MAX_FILES)) {
    lines.push('', '<details>', `<summary>${diff.file}</summary>`, '');
    if (diff.status === 'not produced') {
      lines.push(`Document not produced by ${ref}.`);
    } else if (diff.status === 'removed') {
      lines.push('Document removed.');
    }
    for (const change of diff.changes.slice(0, MAX_PATHS)) {
      lines.push(
        `- \`${change.path}\`: \`${change.before}\` → \`${change.after}\``,
      );
    }
    if (diff.changes.length > MAX_PATHS) {
      lines.push(`- …and ${diff.changes.length - MAX_PATHS} more`);
    }
    lines.push('', '</details>');
  }
  return lines.join('\n');
};

const finish = (out: string, body: string): void => {
  writeFileSync(resolve(ROOT, out), `${body}\n`);
  process.stdout.write(`${body}\n`);
  removeBaseline();
};

const main = (): void => {
  const args = parseArgs(process.argv.slice(2));
  if ('error' in args) {
    process.stderr.write(`${args.error}\n`);
    process.exit(1);
  }
  const ref = args.base ?? lastRelease();
  if (!ref) {
    finish(
      args.out,
      `${MARKER}\n## Generated output vs release\n\nNo baseline: no release tag is reachable from main.`,
    );
    return;
  }

  removeBaseline();
  const added = run('git', ['worktree', 'add', '--detach', BASELINE, ref]);
  if (!added.ok) {
    finish(
      args.out,
      `${MARKER}\n## Generated output vs ${ref}\n\nNo baseline: ${ref} can't be checked out (${firstLine(added.output)}).`,
    );
    return;
  }

  copyFolder('test/contract');
  copyFolder('e2e-applications');
  removeContracts(join(BASELINE, 'test/contract'));

  const install = run('pnpm', [
    '--dir',
    BASELINE,
    'install',
    '--frozen-lockfile',
  ]);
  if (!install.ok) {
    finish(
      args.out,
      `${MARKER}\n## Generated output vs ${ref}\n\nNo baseline: ${ref} can't install dependencies (${firstLine(install.output)}).`,
    );
    return;
  }

  const generated = run(
    'pnpm',
    ['--dir', BASELINE, 'exec', 'vitest', 'run', 'test/contract', '-u'],
    ROOT,
    { CONTRACT_RECORD_ONLY: '1' },
  );
  if (findContracts(BASELINE).size === 0) {
    finish(
      args.out,
      `${MARKER}\n## Generated output vs ${ref}\n\nNo baseline: ${ref} can't run the contract suite (${firstLine(generated.output)}).`,
    );
    return;
  }

  const report = renderReport(
    ref,
    diffContracts(findContracts(ROOT), findContracts(BASELINE)),
  );
  finish(args.out, report);
};

if (import.meta.main) main();
