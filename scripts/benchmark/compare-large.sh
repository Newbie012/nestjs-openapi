#!/usr/bin/env bash
# Times generation of a benchmark project with several source trees.
#
# Usage: scripts/benchmark/compare-large.sh label=path [label=path ...]
#   e.g. scripts/benchmark/compare-large.sh 0.5.2=/tmp/nestjs-openapi-0.5.2 current=.
#
# Each tree runs its own CLI from source through tsx, on a project generated
# by scripts/benchmark/large-project.mjs. Environment:
#   PROJECT   project directory (default: .bench-large)
#   TIMEOUT   seconds before a run is stopped (default: 1200)
#   RUNS      runs per tree (default: 1)
# Outputs are kept as $PROJECT/out-<label>.json for comparison.
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
project="$(cd "${PROJECT:-$repo_root/.bench-large}" && pwd)"
config="$project/openapi.config.ts"
runs="${RUNS:-1}"
timeout="${TIMEOUT:-1200}"

if [[ ! -f "$config" ]]; then
  echo "Run: node scripts/benchmark/large-project.mjs" >&2
  exit 1
fi

printf '| %-8s | %9s | %9s | %13s | %6s | %8s | %s\n' tree "real (s)" "cpu (s)" "peak RSS (MB)" paths schemas result
printf '|%s|%s|%s|%s|%s|%s|%s\n' ---------- ----------- ----------- --------------- -------- ---------- -------
for spec in "$@"; do
  label="${spec%%=*}"
  tree="$(cd "${spec#*=}" && pwd)"
  for ((run = 1; run <= runs; run++)); do
    rm -f "$project/openapi.generated.json"
    log="$(mktemp)"
    status=ok
    (cd "$repo_root" && /usr/bin/time -l perl -e 'alarm shift; exec @ARGV' "$timeout" \
      "$repo_root/node_modules/.bin/tsx" "$tree/src/cli.ts" generate -c "$config" --quiet) \
      >/dev/null 2>"$log" || status=failed
    grep -q "heap out of memory" "$log" && status=OOM
    grep -q "Alarm clock" "$log" && status="timeout ${timeout}s"
    real=$(awk '/ real /{print $1}' "$log")
    cpu=$(awk '/ real /{printf "%.1f", $3 + $5}' "$log")
    rss=$(awk '/maximum resident set size/{printf "%d", $1 / 1048576}' "$log")
    counts="- -"
    if [[ -f "$project/openapi.generated.json" ]]; then
      counts=$(node -e "const s=require('$project/openapi.generated.json');console.log(Object.keys(s.paths).length, Object.keys(s.components?.schemas??{}).length)")
      cp "$project/openapi.generated.json" "$project/out-$label.json"
    fi
    printf '| %-8s | %9s | %9s | %13s | %6s | %8s | %s\n' "$label" "$real" "$cpu" "$rss" $counts "$status"
    rm -f "$log"
  done
done
