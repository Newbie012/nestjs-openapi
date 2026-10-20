import { appendFileSync } from 'node:fs';

const counts = new Map<string, number>();

/**
 * Spike instrumentation: counts expensive steps and appends the totals as
 * one JSON line to the file named by `NOA_SPIKE_COUNTS` when the process
 * exits.
 */
export const spikeCount = (name: string) => {
  const target = process.env.NOA_SPIKE_COUNTS;
  if (!target) return;
  if (counts.size === 0) {
    process.on('exit', () => {
      appendFileSync(
        target,
        `${JSON.stringify(Object.fromEntries([...counts].sort()))}\n`,
      );
    });
  }
  counts.set(name, (counts.get(name) ?? 0) + 1);
};
