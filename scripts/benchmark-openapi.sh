#!/usr/bin/env bash
set -euo pipefail

label=""
output=""
repo="."
runs=3
warmup=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --label)
      label="$2"
      shift 2
      ;;
    --output)
      output="$2"
      shift 2
      ;;
    --runs)
      runs="$2"
      shift 2
      ;;
    --repo)
      repo="$2"
      shift 2
      ;;
    --warmup)
      warmup="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$label" || -z "$output" ]]; then
  echo "Usage: $0 --label <label> --output <file> [--repo PATH] [--runs N] [--warmup N]" >&2
  exit 1
fi

command=(pnpm -C "$repo" tsx src/cli.ts generate -c e2e-applications/comparison-benchmark/openapi.config.ts)

for ((i=1; i<=warmup; i++)); do
  "${command[@]}" >/dev/null
done

durations=()
for ((i=1; i<=runs; i++)); do
  start_ns=$(date +%s%N)
  "${command[@]}" >/dev/null
  end_ns=$(date +%s%N)
  duration_ms=$(( (end_ns - start_ns) / 1000000 ))
  durations+=("$duration_ms")
done

durations_csv=$(IFS=,; echo "${durations[*]}")

LABEL="$label" OUTPUT="$output" DURATIONS="$durations_csv" node -e '
  const fs = require("fs");
  const label = process.env.LABEL;
  const output = process.env.OUTPUT;
  const durations = process.env.DURATIONS.split(",").map((v) => Number(v));
  const avg = durations.reduce((sum, v) => sum + v, 0) / durations.length;
  const payload = {
    label,
    runs: durations.length,
    durations_ms: durations,
    avg_ms: avg,
  };
  fs.writeFileSync(output, JSON.stringify(payload, null, 2));
'
