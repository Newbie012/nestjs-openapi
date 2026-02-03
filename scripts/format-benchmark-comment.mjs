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

// Build lookup map for base results
const baseByName = new Map(base.targets.map((t) => [t.name, t]));

// Generate table rows
const rows = head.targets.map((headTarget) => {
  const baseTarget = baseByName.get(headTarget.name);
  if (!baseTarget) {
    return `| ${headTarget.name} | - | ${formatMs(headTarget.avg_ms)} | new |`;
  }

  const pct =
    ((headTarget.avg_ms - baseTarget.avg_ms) / baseTarget.avg_ms) * 100;
  let emoji = '';
  if (pct <= -10) emoji = ' :rocket:';
  if (pct >= 10) emoji = ' :warning:';

  const diffLabel = pct >= 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`;

  return `| ${headTarget.name} | ${formatMs(baseTarget.avg_ms)} | ${formatMs(headTarget.avg_ms)} | ${diffLabel}${emoji} |`;
});

// Generate raw timings details
const rawTimings = head.targets.map((headTarget) => {
  const baseTarget = baseByName.get(headTarget.name);
  const baseInfo = baseTarget
    ? `Base: ${baseTarget.durations_ms.join(', ')} (avg: ${baseTarget.avg_ms.toFixed(1)})`
    : 'Base: n/a';
  const headInfo = `PR: ${headTarget.durations_ms.join(', ')} (avg: ${headTarget.avg_ms.toFixed(1)})`;
  return `**${headTarget.name}**\n- ${baseInfo}\n- ${headInfo}`;
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
