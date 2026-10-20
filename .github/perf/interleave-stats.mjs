import { readFileSync } from 'node:fs';

const [file] = process.argv.slice(2);
const rows = readFileSync(file, 'utf8')
  .split('\n')
  .filter((line) => line.startsWith('| ') && !line.includes('real (s)'))
  .map((line) => line.split('|').map((cell) => cell.trim()));

const byTree = new Map();
for (const [, label, real, cpu, rss, , , result] of rows) {
  if (result !== 'ok') continue;
  const entry = byTree.get(label) ?? { real: [], cpu: [], rss: [] };
  entry.real.push(Number(real));
  entry.cpu.push(Number(cpu));
  entry.rss.push(Number(rss));
  byTree.set(label, entry);
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const fmt = (n) => n.toFixed(2);

const labels = [...byTree.keys()];
const baseline = byTree.get(labels[0]);
const out = [];
out.push('| tree | n | wall median | wall min | wall max | wall spread | cpu median | cpu min | cpu max | cpu spread | wall vs first | cpu vs first |');
out.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const label of labels) {
  const { real, cpu } = byTree.get(label);
  const rm = median(real);
  const cm = median(cpu);
  const pct = (a, b) => `${a >= b ? '+' : ''}${(((a - b) / b) * 100).toFixed(1)}%`;
  out.push(
    `| ${label} | ${real.length} | ${fmt(rm)} | ${fmt(Math.min(...real))} | ${fmt(Math.max(...real))} | ${fmt(Math.max(...real) - Math.min(...real))} | ${fmt(cm)} | ${fmt(Math.min(...cpu))} | ${fmt(Math.max(...cpu))} | ${fmt(Math.max(...cpu) - Math.min(...cpu))} | ${pct(rm, median(baseline.real))} | ${pct(cm, median(baseline.cpu))} |`,
  );
}

const rounds = Math.min(...[...byTree.values()].map((entry) => entry.real.length));
out.push('');
out.push('Per-round ratio against the first tree (same round, back to back):');
out.push('');
out.push(`| tree | metric | median ratio | min | max |`);
out.push('|---|---|---:|---:|---:|');
for (const label of labels.slice(1)) {
  for (const metric of ['real', 'cpu']) {
    const ratios = [];
    for (let i = 0; i < rounds; i++) {
      ratios.push(byTree.get(label)[metric][i] / baseline[metric][i]);
    }
    out.push(`| ${label} | ${metric === 'real' ? 'wall' : 'cpu'} | ${fmt(median(ratios))} | ${fmt(Math.min(...ratios))} | ${fmt(Math.max(...ratios))} |`);
  }
}
console.log(out.join('\n'));
