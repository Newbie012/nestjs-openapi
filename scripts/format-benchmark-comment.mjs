import fs from 'node:fs';
import path from 'node:path';

const [resultsDir, outputPath] = process.argv.slice(2);

if (!resultsDir || !outputPath) {
  console.error(
    'Usage: node scripts/format-benchmark-comment.mjs <results-dir> <output.md>',
  );
  process.exit(1);
}

// Read all benchmark results from artifact directories
// Structure: results/benchmark-<app>/head.json, results/benchmark-<app>/base.json
const entries = fs.readdirSync(resultsDir, { withFileTypes: true });
const results = [];

for (const entry of entries) {
  if (!entry.isDirectory() || !entry.name.startsWith('benchmark-')) continue;

  const appDir = path.join(resultsDir, entry.name);
  const headPath = path.join(appDir, 'head.json');
  const basePath = path.join(appDir, 'base.json');

  if (!fs.existsSync(headPath)) continue;

  const head = JSON.parse(fs.readFileSync(headPath, 'utf-8'));
  const base = fs.existsSync(basePath)
    ? JSON.parse(fs.readFileSync(basePath, 'utf-8'))
    : null;

  results.push({ head, base });
}

// Sort by app name
results.sort((a, b) => a.head.name.localeCompare(b.head.name));

const formatMs = (ms) => `${(ms / 1000).toFixed(2)}s`;

// Generate table rows
const rows = results.map(({ head, base }) => {
  if (!base || base.runs === 0) {
    return `| ${head.name} | - | ${formatMs(head.avg_ms)} | new |`;
  }

  const pct = ((head.avg_ms - base.avg_ms) / base.avg_ms) * 100;
  let emoji = '';
  if (pct <= -10) emoji = ' :rocket:';
  if (pct >= 10) emoji = ' :warning:';

  const diffLabel = pct >= 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`;

  return `| ${head.name} | ${formatMs(base.avg_ms)} | ${formatMs(head.avg_ms)} | ${diffLabel}${emoji} |`;
});

// Generate raw timings details
const rawTimings = results.map(({ head, base }) => {
  const baseInfo =
    base && base.runs > 0
      ? `Base: ${base.durations_ms.join(', ')} (avg: ${base.avg_ms.toFixed(1)})`
      : 'Base: n/a';
  const headInfo = `PR: ${head.durations_ms.join(', ')} (avg: ${head.avg_ms.toFixed(1)})`;
  return `**${head.name}**\n- ${baseInfo}\n- ${headInfo}`;
});

const body = `<!-- benchmark-openapi -->
## :zap: OpenAPI Generation Benchmark

| Target | Base | PR | Diff |
|--------|------|----|------|
${rows.join('\n')}

<details>
<summary>Raw timings (ms)</summary>

${rawTimings.join('\n\n')}

</details>
`;

fs.writeFileSync(outputPath, body);
