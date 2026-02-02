import { defineBuildConfig } from 'unbuild';

export default defineBuildConfig({
  entries: [
    // Main entry point
    { input: 'src/index.ts', name: 'index' },
    // Internal utilities entry point
    { input: 'src/internal.ts', name: 'internal' },
    // CLI entry point
    { input: 'src/cli.ts', name: 'cli' },
  ],
  outDir: 'dist',
  clean: true,
  declaration: true,
  rollup: {
    emitCJS: false, // ESM only
    esbuild: {
      target: 'node18',
      minify: false,
    },
  },
  externals: [
    // Peer dependencies
    '@nestjs/common',
    '@nestjs/core',
    '@nestjs/swagger',
    // Dependencies (not bundled)
    'effect',
    'ts-morph',
    'ts-json-schema-generator',
    'glob',
    'minimist',
  ],
});
