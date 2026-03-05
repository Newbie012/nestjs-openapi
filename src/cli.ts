#!/usr/bin/env node
/**
 * CLI entry point for nestjs-openapi
 *
 * Usage:
 *   nestjs-openapi generate -c openapi.config.ts
 *   nestjs-openapi generate -c openapi.config.ts --quiet
 */

// Register tsx TypeScript loader to support .ts config files
import 'tsx';

import { Cause, Effect, Exit, Option } from 'effect';
import { generateEffect } from './generate.js';
import { formatValidationResult } from './spec-validator.js';
import { toUserFacingErrorMessage } from './error-message.js';
import { runtimeLayerFor } from './runtime-layer.js';
import { generatorServicesLayer } from './service-layer.js';
import minimist from 'minimist';
import { relative } from 'node:path';
import { createRequire } from 'node:module';
import type { TelemetryConfig } from './types.js';

// Read version from package.json at runtime
const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

interface CliArgs {
  _: string[];
  c?: string;
  config?: string;
  format?: string;
  f?: string;
  quiet?: boolean;
  q?: boolean;
  debug?: boolean;
  d?: boolean;
  otel?: boolean;
  'otel-exporter'?: string;
  'otel-endpoint'?: string;
  'otel-service-name'?: string;
  help?: boolean;
  h?: boolean;
  version?: boolean;
  v?: boolean;
}

const VERSION = pkg.version;

const HELP_TEXT = `
nestjs-openapi - Generate OpenAPI specs from NestJS applications

Usage:
  nestjs-openapi generate -c <config-path>    Generate OpenAPI specification
  nestjs-openapi --help                       Show this help message
  nestjs-openapi --version                    Show version

Options:
  -c, --config <path>     Path to configuration file (required)
  -f, --format <format>   Output format: json or yaml (overrides config)
  -q, --quiet             Suppress output (only show errors)
  -d, --debug             Enable debug output (verbose logging, full stack traces)
      --otel              Enable OpenTelemetry tracing
      --otel-exporter     OTel exporter: console or otlp (default: console)
      --otel-endpoint     OTLP HTTP endpoint (default: http://localhost:4318/v1/traces)
      --otel-service-name Service name for trace resource (default: nestjs-openapi)
  -h, --help              Show this help message
  -v, --version           Show version

Examples:
  nestjs-openapi generate -c openapi.config.ts
  nestjs-openapi generate -c openapi.config.ts --format yaml
  nestjs-openapi generate -c openapi.config.ts --debug
  nestjs-openapi generate -c openapi.config.ts --otel --otel-exporter console
`.trim();

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const success = (message: string): void => {
  console.log(`\x1b[32m✓\x1b[0m ${message}`);
};

const warning = (message: string): void => {
  console.log(`\x1b[33m⚠\x1b[0m ${message}`);
};

const error = (message: string): void => {
  console.error(`\x1b[31m✗\x1b[0m ${message}`);
};

const formatCauseForDebug = (cause: unknown): string | undefined => {
  if (!cause || typeof cause !== 'object') {
    return undefined;
  }

  if ('stack' in cause && typeof cause.stack === 'string') {
    return cause.stack;
  }

  if ('cause' in cause && cause.cause !== undefined) {
    return String(cause.cause);
  }

  return undefined;
};

const main = async (): Promise<void> => {
  const args = minimist<CliArgs>(process.argv.slice(2), {
    string: [
      'c',
      'config',
      'f',
      'format',
      'otel-exporter',
      'otel-endpoint',
      'otel-service-name',
    ],
    boolean: ['quiet', 'q', 'debug', 'd', 'otel', 'help', 'h', 'version', 'v'],
    alias: {
      c: 'config',
      f: 'format',
      q: 'quiet',
      d: 'debug',
      h: 'help',
      v: 'version',
    },
  });

  // Handle help
  if (args.help || args.h) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  // Handle version
  if (args.version || args.v) {
    console.log(VERSION);
    process.exit(0);
  }

  const command = args._[0];

  // Handle no command
  if (!command) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  // Handle unknown commands
  if (command !== 'generate') {
    error(`Unknown command: ${command}`);
    console.log('\nRun "nestjs-openapi --help" for usage information.');
    process.exit(1);
  }

  // Handle generate command
  const configPath = args.config || args.c;
  const format = args.format || args.f;
  const quiet = Boolean(args.quiet || args.q);
  const debug = Boolean(args.debug || args.d);
  const otel = Boolean(args.otel);
  const otelExporter = args['otel-exporter'];
  const otelEndpoint = args['otel-endpoint'];
  const otelServiceName = args['otel-service-name'];

  if (!configPath) {
    error('Config path is required. Use -c or --config to specify the path.');
    console.log('\nExample: nestjs-openapi generate -c openapi.config.ts');
    process.exit(1);
  }

  // Validate format option
  if (format && format !== 'json' && format !== 'yaml') {
    error(`Invalid format: ${format}. Must be 'json' or 'yaml'.`);
    process.exit(1);
  }

  if (
    otelExporter &&
    otelExporter !== 'console' &&
    otelExporter !== 'otlp'
  ) {
    error(`Invalid --otel-exporter: ${otelExporter}. Must be 'console' or 'otlp'.`);
    process.exit(1);
  }

  const telemetry: TelemetryConfig | undefined = otel
    ? {
        enabled: true,
        exporter: (otelExporter as 'console' | 'otlp' | undefined) ?? 'console',
        otlpEndpoint: otelEndpoint,
        serviceName: otelServiceName,
      }
    : undefined;

  const startTime = performance.now();

  const program = generateEffect(configPath, {
    format: format as 'json' | 'yaml' | undefined,
    debug,
    telemetry,
  }).pipe(
    Effect.provide(generatorServicesLayer),
    Effect.provide(runtimeLayerFor(debug, telemetry)),
    Effect.exit,
  );

  const exit = await Effect.runPromise(program);

  if (Exit.isSuccess(exit)) {
    const result = exit.value;
    const duration = performance.now() - startTime;

    if (!quiet) {
      const relativePath = relative(process.cwd(), result.outputPath);
      success(
        `Generated ${relativePath} (${formatDuration(Math.round(duration))})`,
      );
      console.log(
        `  ${result.pathCount} paths, ${result.operationCount} operations`,
      );

      // Show validation warnings if there are broken refs
      if (!result.validation.valid) {
        console.log('');
        warning(`Spec has broken references`);
        console.log(`  ${formatValidationResult(result.validation)}`);
      }
    }

    process.exit(result.validation.valid ? 0 : 1);
  } else {
    const duration = performance.now() - startTime;
    const failure = Cause.failureOption(exit.cause);
    const message = failure.pipe(
      Option.map(toUserFacingErrorMessage),
      Option.getOrElse(() => toUserFacingErrorMessage(undefined)),
    );

    error(`Generation failed (${formatDuration(Math.round(duration))})`);
    console.error(`  ${message}`);

    if (debug) {
      failure.pipe(
        Option.map(formatCauseForDebug),
        Option.match({
          onNone: () => undefined,
          onSome: (debugOutput) => {
            if (debugOutput) {
              console.error('\nStack trace:');
              console.error(debugOutput);
            } else {
              console.error('\nCause:');
              console.error(Cause.pretty(exit.cause));
            }
          },
        }),
      );
    }

    process.exit(1);
  }
};

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
