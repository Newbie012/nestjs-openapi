#!/usr/bin/env bash
set -euo pipefail

label=""
output=""
repo="."
app=""
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
    --app)
      app="$2"
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
  echo "Usage: $0 --label <label> --output <file> [--repo PATH] [--app NAME] [--runs N] [--warmup N]" >&2
  exit 1
fi

# If --app specified, benchmark single app; otherwise benchmark all
if [[ -n "$app" ]]; then
  config="$repo/e2e-applications/$app/openapi.config.ts"
  if [[ ! -f "$config" ]]; then
    echo "Config not found: $config" >&2
    exit 1
  fi
  configs=("$config")
else
  configs=()
  for config in "$repo"/e2e-applications/*/openapi.config.ts; do
    if [[ -f "$config" ]]; then
      configs+=("$config")
    fi
  done
fi

if [[ ${#configs[@]} -eq 0 ]]; then
  echo "No openapi.config.ts files found" >&2
  exit 1
fi

# Single app mode: output flat JSON
if [[ -n "$app" ]]; then
  echo "Benchmarking $app..." >&2
  
  # Warmup
  for ((i=1; i<=warmup; i++)); do
    pnpm --dir "$repo" exec tsx src/cli.ts generate -c "${configs[0]}" >/dev/null 2>&1 || true
  done
  
  # Benchmark runs
  durations=()
  for ((i=1; i<=runs; i++)); do
    start_ns=$(date +%s%N)
    pnpm --dir "$repo" exec tsx src/cli.ts generate -c "${configs[0]}" >/dev/null 2>&1
    end_ns=$(date +%s%N)
    duration_ms=$(( (end_ns - start_ns) / 1000000 ))
    durations+=("$duration_ms")
  done
  
  # Calculate average
  sum=0
  for d in "${durations[@]}"; do
    sum=$((sum + d))
  done
  avg=$((sum / ${#durations[@]}))
  
  durations_json=$(printf '%s,' "${durations[@]}" | sed 's/,$//')
  echo '{"name":"'"$app"'","runs":'"${#durations[@]}"',"durations_ms":['"$durations_json"'],"avg_ms":'"$avg"'}' > "$output"
  echo "Results written to $output" >&2
  exit 0
fi

# Multi-app mode: output nested JSON with targets array
results_json='{"label":"'"$label"'","targets":['

first=true
for config in "${configs[@]}"; do
  app_name=$(basename "$(dirname "$config")")
  
  echo "Benchmarking $app_name..." >&2
  
  # Warmup
  for ((i=1; i<=warmup; i++)); do
    pnpm --dir "$repo" exec tsx src/cli.ts generate -c "$config" >/dev/null 2>&1 || true
  done
  
  # Benchmark runs
  durations=()
  for ((i=1; i<=runs; i++)); do
    start_ns=$(date +%s%N)
    pnpm --dir "$repo" exec tsx src/cli.ts generate -c "$config" >/dev/null 2>&1
    end_ns=$(date +%s%N)
    duration_ms=$(( (end_ns - start_ns) / 1000000 ))
    durations+=("$duration_ms")
  done
  
  # Calculate average
  sum=0
  for d in "${durations[@]}"; do
    sum=$((sum + d))
  done
  avg=$((sum / ${#durations[@]}))
  
  durations_json=$(printf '%s,' "${durations[@]}" | sed 's/,$//')
  
  if [[ "$first" == "true" ]]; then
    first=false
  else
    results_json+=','
  fi
  
  results_json+='{"name":"'"$app_name"'","runs":'"${#durations[@]}"',"durations_ms":['"$durations_json"'],"avg_ms":'"$avg"'}'
done

results_json+=']}'

echo "$results_json" > "$output"
echo "Results written to $output" >&2
