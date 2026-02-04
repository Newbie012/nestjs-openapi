#!/usr/bin/env node
/**
 * CLI entry point for nestjs-openapi-static
 *
 * Usage:
 *   nestjs-openapi-static generate -c openapi.config.ts
 *   nestjs-openapi-static generate -c openapi.config.ts --quiet
 */

// Register tsx TypeScript loader to support .ts config files
import 'tsx';

import { generate } from './generate.js';
import { formatValidationResult } from './spec-validator.js';
import minimist from 'minimist';
import { relative } from 'node:path';
import { createRequire } from 'node:module';

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
  help?: boolean;
  h?: boolean;
  version?: boolean;
  v?: boolean;
}

const VERSION = pkg.version;

const HELP_TEXT = `
nestjs-openapi-static - Generate OpenAPI specs from NestJS applications

Usage:
  nestjs-openapi-static generate -c <config-path>    Generate OpenAPI specification
  nestjs-openapi-static --help                       Show this help message
  nestjs-openapi-static --version                    Show version

Options:
  -c, --config <path>     Path to configuration file (required)
  -f, --format <format>   Output format: json or yaml (overrides config)
  -q, --quiet             Suppress output (only show errors)
  -d, --debug             Enable debug output (verbose logging, full stack traces)
  -h, --help              Show this help message
  -v, --version           Show version

Examples:
  nestjs-openapi-static generate -c openapi.config.ts
  nestjs-openapi-static generate -c openapi.config.ts --format yaml
  nestjs-openapi-static generate -c openapi.config.ts --debug
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

const main = async (): Promise<void> => {
  const args = minimist<CliArgs>(process.argv.slice(2), {
    string: ['c', 'config', 'f', 'format'],
    boolean: [
      'quiet',
      'q',
      'debug',
      'd',
      'help',
      'h',
      'version',
      'v',
    ],
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
    console.log('\nRun "nestjs-openapi-static --help" for usage information.');
    process.exit(1);
  }

  // Handle generate command
  const configPath = args.config || args.c;
  const format = args.format || args.f;
  const quiet = args.quiet || args.q;
  const debug = args.debug || args.d;

  if (!configPath) {
    error('Config path is required. Use -c or --config to specify the path.');
    console.log(
      '\nExample: nestjs-openapi-static generate -c openapi.config.ts',
    );
    process.exit(1);
  }

  // Validate format option
  if (format && format !== 'json' && format !== 'yaml') {
    error(`Invalid format: ${format}. Must be 'json' or 'yaml'.`);
    process.exit(1);
  }

  const startTime = performance.now();

  try {
    const result = await generate(configPath, {
      format: format as 'json' | 'yaml' | undefined,
      debug,
    });
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

    // Exit with code 0 even with validation warnings (spec was generated)
    process.exit(0);
  } catch (err) {
    const duration = performance.now() - startTime;
    const message = err instanceof Error ? err.message : String(err);

    error(`Generation failed (${formatDuration(Math.round(duration))})`);
    console.error(`  ${message}`);

    if (debug && err instanceof Error && err.stack) {
      console.error('\nStack trace:');
      console.error(err.stack);
      if (err.cause) {
        console.error('\nCause:', err.cause);
      }
    }

    process.exit(1);
  }
};

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
