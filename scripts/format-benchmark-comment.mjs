import fs from 'node:fs';

const [basePath, headPath, outputPath] = process.argv.slice(2);

if (!basePath || !headPath || !outputPath) {
  console.error(
    'Usage: node scripts/format-benchmark-comment.mjs <base.json> <head.json> <output.md>',
  );
  process.exit(1);
}

const base = JSON.parse(fs.readFileSync(basePath, 'utf-8'));
const head = JSON.parse(fs.readFileSync(headPath, 'utf-8'));

const formatMs = (ms) => `${(ms / 1000).toFixed(2)}s`;
const pct = ((head.avg_ms - base.avg_ms) / base.avg_ms) * 100;

let emoji = '✅';
if (pct <= -10) emoji = '🚀';
if (pct >= 10) emoji = '⚠️';

const diffLabel = pct >= 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`;

const body = `<!-- benchmark-openapi -->
## ⚡ OpenAPI Generation Benchmark

| Target | Base | PR | Diff |
|--------|------|----|------|
| comparison-benchmark | ${formatMs(base.avg_ms)} | ${formatMs(head.avg_ms)} | ${diffLabel} ${emoji} |

<details>
<summary>Raw timings (ms)</summary>

- Base: ${base.durations_ms.join(', ')} (avg: ${base.avg_ms.toFixed(1)})
- PR: ${head.durations_ms.join(', ')} (avg: ${head.avg_ms.toFixed(1)})

</details>
`;

fs.writeFileSync(outputPath, body);
