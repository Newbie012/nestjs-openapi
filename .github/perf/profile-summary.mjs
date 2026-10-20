import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const files = readdirSync(dir).filter((f) => f.endsWith('.cpuprofile'));
const byFile = new Map();
const phases = { parse: 0, bind: 0, other: 0 };
const parseFns = new Set(['createSourceFile', 'parseSourceFile', 'parseSourceFileWorker']);
const bindFns = new Set(['bindSourceFile']);
let total = 0;

const bucketOf = (url) => {
  if (!url) return 'native/(no url)';
  const path = url.replace(/^file:\/\//, '');
  const nm = path.lastIndexOf('node_modules/');
  if (nm >= 0) {
    const rest = path.slice(nm + 'node_modules/'.length).split('/');
    const pkg = rest[0].startsWith('@') ? rest.slice(0, 2).join('/') : rest[0];
    return `node_modules/${pkg}`;
  }
  if (path.startsWith('node:')) return 'node internals';
  return path.includes('/src/') ? 'repo src' : path.includes('/test/') ? 'repo test' : 'other';
};

for (const f of files) {
  const profile = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const phaseOf = new Map();
  const resolvePhase = (id) => {
    if (phaseOf.has(id)) return phaseOf.get(id);
    const n = nodes.get(id);
    const name = n.callFrame.functionName;
    let result;
    if (parseFns.has(name)) result = 'parse';
    else if (bindFns.has(name)) result = 'bind';
    else {
      const p = parent.get(id);
      result = p === undefined ? 'other' : resolvePhase(p);
    }
    phaseOf.set(id, result);
    return result;
  };
  profile.samples.forEach((id, i) => {
    const dt = profile.timeDeltas[i] / 1000;
    const n = nodes.get(id);
    const bucket = bucketOf(n.callFrame.url);
    byFile.set(bucket, (byFile.get(bucket) ?? 0) + dt);
    phases[resolvePhase(id)] += dt;
    total += dt;
  });
}

const pct = (v) => ((v / total) * 100).toFixed(1);
const out = [];
out.push(`Profiles: ${files.length}, total sampled CPU: ${(total / 1000).toFixed(1)} s`);
out.push('');
out.push('| inclusive phase | seconds | share |');
out.push('|---|---:|---:|');
for (const [k, v] of Object.entries(phases)) {
  out.push(`| ${k === 'other' ? 'everything else' : `TypeScript ${k} (createSourceFile / bindSourceFile subtree)`} | ${(v / 1000).toFixed(1)} | ${pct(v)}% |`);
}
out.push('');
out.push('| self time by package | seconds | share |');
out.push('|---|---:|---:|');
for (const [k, v] of [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  out.push(`| ${k} | ${(v / 1000).toFixed(1)} | ${pct(v)}% |`);
}
console.log(out.join('\n'));
