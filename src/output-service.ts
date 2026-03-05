import { Effect } from 'effect';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import yaml from 'js-yaml';
import type { OpenApiSpec } from './types.js';
import {
  OutputDirectoryCreationError,
  OutputSerializationError,
  OutputWriteError,
} from './errors.js';

const pathExistsEffect = Effect.fn('OutputService.pathExists')(function* (
  filePath: string,
) {
  return yield* Effect.sync(() => existsSync(filePath));
});

const serviceEnsureOutputDirectory = Effect.fn(
  'OutputService.ensureOutputDirectory',
)(function* (outputPath: string) {
  const outputDir = dirname(outputPath);
  const outputDirExists = yield* pathExistsEffect(outputDir);
  if (outputDirExists) {
    return;
  }

  yield* Effect.try({
    try: () => mkdirSync(outputDir, { recursive: true }),
    catch: (cause) => OutputDirectoryCreationError.create(outputDir, cause),
  });
});

const serviceSerializeSpec = Effect.fn('OutputService.serializeSpec')(function* (
  spec: OpenApiSpec,
  outputPath: string,
  format: 'json' | 'yaml',
) {
  return yield* (format === 'json'
    ? Effect.try({
        try: () => JSON.stringify(spec, null, 2),
        catch: (cause) => OutputSerializationError.json(outputPath, cause),
      })
    : Effect.try({
        try: () =>
          yaml.dump(spec, {
            indent: 2,
            lineWidth: -1,
            noRefs: true,
            quotingType: '"',
            forceQuotes: false,
          }),
        catch: (cause) => OutputSerializationError.yaml(outputPath, cause),
      }));
});

const serviceWriteOutput = Effect.fn('OutputService.writeOutput')(function* (
  outputPath: string,
  content: string,
  format: 'json' | 'yaml',
) {
  yield* Effect.try({
    try: () => writeFileSync(outputPath, content, 'utf-8'),
    catch: (cause) =>
      format === 'json'
        ? OutputWriteError.json(outputPath, cause)
        : OutputWriteError.yaml(outputPath, cause),
  });
});

export class OutputService extends Effect.Service<OutputService>()(
  'OutputService',
  {
    accessors: true,
    effect: Effect.succeed({
      ensureOutputDirectory: serviceEnsureOutputDirectory,
      serializeSpec: serviceSerializeSpec,
      writeOutput: serviceWriteOutput,
    }),
  },
) {}
