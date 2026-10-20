#!/usr/bin/env bash
# One timed generation of PROJECT with one source tree, printed as a row of
# scripts/benchmark/compare-large.sh. A run counts as ok when it writes the
# document, even if validation then fails (the real app has one broken ref
# on every tree).
# Usage: .github/perf/time-run.sh label tree project
set -uo pipefail
label="$1"; tree="$2"; project="$3"
repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
rm -f "$project/openapi.generated.json"
log="$(mktemp)"
(cd "$repo_root" && /usr/bin/time -l "$repo_root/node_modules/.bin/tsx" "$tree/src/cli.ts" generate -c "$project/openapi.config.ts" --quiet) >/dev/null 2>"$log"
code=$?
real=$(awk '/ real /{print $1}' "$log")
cpu=$(awk '/ real /{printf "%.1f", $3 + $5}' "$log")
rss=$(awk '/maximum resident set size/{printf "%d", $1 / 1048576}' "$log")
status="failed (exit $code)"
counts="- -"
if [[ -f "$project/openapi.generated.json" ]]; then
  status=ok
  counts=$(node -e "const s=require('$project/openapi.generated.json');console.log(Object.keys(s.paths).length, Object.keys(s.components?.schemas??{}).length)")
  cp "$project/openapi.generated.json" "$project/out-$label.json"
else
  tail -20 "$log" >&2
fi
printf '| %-8s | %9s | %9s | %13s | %6s | %8s | %s\n' "$label" "$real" "$cpu" "$rss" $counts "$status"
rm -f "$log"
