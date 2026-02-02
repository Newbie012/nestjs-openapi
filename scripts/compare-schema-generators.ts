/**
 * Compare custom schema generator vs ts-json-schema-generator
 *
 * Tests:
 * 1. Performance (speed)
 * 2. Feature parity (schema count, structure)
 * 3. Quality comparison against staged spec
 *
 * Usage: npx tsx scripts/compare-schema-generators.ts
 */

import { Project } from 'ts-morph';
import { performance } from 'node:perf_hooks';
import { glob } from 'glob';
import { join, resolve, dirname } from 'node:path';
import { Effect } from 'effect';
import { generateSchemas } from '../src/schema-generator.js';
import { generateSchemasFromFiles } from '../src/custom-schema-generator.js';
import { readFileSync, writeFileSync } from 'node:fs';

const CONFIG = {
  basePath: '/Users/eliya/projects/oligo/platform/apps/backend-api',
  tsconfig: '/Users/eliya/projects/oligo/platform/tsconfig.json',
  dtoGlob: [
    'src/**/*.dto.ts',
    'src/**/*.errors.ts',
    'src/**/*.model.ts',
    'src/**/glossary.ts',
    'src/**/pagination/**/get-metadata.ts',
    'src/common/interfaces.ts',
    '../../libs/jira/src/glossary.ts',
    '../../libs/vulnerability/src/external-vulnerability.dto.ts',
  ],
  stagedSpec:
    '/Users/eliya/projects/oligo/platform/apps/backend-api/src/openapi/openapi.static-generated.json',
};

async function testTsJsonSchemaGenerator(): Promise<{
  duration: number;
  schemaCount: number;
  schemas: Record<string, unknown>;
}> {
  console.log('\n📦 Testing ts-json-schema-generator...');
  const start = performance.now();

  const schemaResult = await Effect.runPromise(
    generateSchemas({
      dtoGlob: CONFIG.dtoGlob,
      tsconfig: CONFIG.tsconfig,
      basePath: CONFIG.basePath,
    }),
  );

  const duration = performance.now() - start;
  const schemaCount = Object.keys(schemaResult.definitions).length;

  console.log(
    `✅ Generated ${schemaCount} schemas in ${duration.toFixed(0)}ms`,
  );

  return {
    duration,
    schemaCount,
    schemas: schemaResult.definitions,
  };
}

async function testCustomGenerator(): Promise<{
  duration: number;
  schemaCount: number;
  schemas: Record<string, unknown>;
}> {
  console.log('\n⚡ Testing custom schema generator...');
  const start = performance.now();

  // Find DTO files
  const absolutePatterns = CONFIG.dtoGlob.map((pattern) =>
    pattern.startsWith('/') ? pattern : join(CONFIG.basePath, pattern),
  );

  const fileArrays = await Promise.all(
    absolutePatterns.map((pattern) =>
      glob(pattern, { absolute: true, nodir: true }),
    ),
  );

  const dtoFiles = fileArrays.flat();
  console.log(`📁 Found ${dtoFiles.length} DTO files`);

  // Find ALL TypeScript files in the project (including libs)
  // libs is at the same level as apps/, not inside apps/
  const projectRoot = dirname(dirname(CONFIG.basePath));
  const allPatterns = [
    join(CONFIG.basePath, 'src/**/*.ts'),
    join(projectRoot, 'libs/**/*.ts'),
  ];

  const allFileArrays = await Promise.all(
    allPatterns.map((pattern) =>
      glob(pattern, {
        absolute: true,
        nodir: true,
        ignore: ['**/*.spec.ts', '**/*.test.ts'],
      }),
    ),
  );

  const allFiles = [...new Set(allFileArrays.flat())];
  console.log(`📁 Found ${allFiles.length} total TypeScript files`);

  // Setup project
  const project = new Project({
    tsConfigFilePath: CONFIG.tsconfig,
    skipAddingFilesFromTsConfig: true,
  });

  // Add ALL files (not just DTOs) - this ensures type resolution works
  project.addSourceFilesAtPaths(allFiles);
  console.log(
    `📁 Loaded ${project.getSourceFiles().length} files into project`,
  );

  // Generate schemas using custom generator
  const schemaMap = await generateSchemasFromFiles(
    dtoFiles,
    project,
    CONFIG.basePath,
  );

  // Convert to plain object
  const schemas: Record<string, unknown> = {};
  for (const [name, schema] of schemaMap) {
    schemas[name] = schema;
  }

  const duration = performance.now() - start;
  const schemaCount = Object.keys(schemas).length;

  console.log(
    `✅ Generated ${schemaCount} schemas in ${duration.toFixed(0)}ms`,
  );

  return {
    duration,
    schemaCount,
    schemas,
  };
}

function compareSchemas(
  tsJsonSchemas: Record<string, unknown>,
  customSchemas: Record<string, unknown>,
  stagedSchemas: Record<string, unknown>,
) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 SCHEMA COMPARISON');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const tsJsonKeys = Object.keys(tsJsonSchemas).sort();
  const customKeys = Object.keys(customSchemas).sort();
  const stagedKeys = Object.keys(stagedSchemas).sort();

  console.log(`\nSchema counts:`);
  console.log(`  📦 ts-json-schema-generator: ${tsJsonKeys.length}`);
  console.log(`  ⚡ Custom generator: ${customKeys.length}`);
  console.log(`  🎯 Staged reference: ${stagedKeys.length}`);

  // Find missing schemas
  const missingInCustom = tsJsonKeys.filter((k) => !customKeys.includes(k));
  const missingInTsJson = customKeys.filter((k) => !tsJsonKeys.includes(k));
  const missingInStaged = stagedKeys.filter((k) => !customKeys.includes(k));

  console.log(`\n❌ Missing in custom generator: ${missingInCustom.length}`);
  if (missingInCustom.length > 0 && missingInCustom.length <= 15) {
    missingInCustom.forEach((k) => console.log(`   - ${k}`));
  } else if (missingInCustom.length > 15) {
    missingInCustom.slice(0, 15).forEach((k) => console.log(`   - ${k}`));
    console.log(`   ... and ${missingInCustom.length - 15} more`);
  }

  console.log(`\n✨ Extra in custom generator: ${missingInTsJson.length}`);
  if (missingInTsJson.length > 0 && missingInTsJson.length <= 10) {
    missingInTsJson.forEach((k) => console.log(`   - ${k}`));
  }

  // Compare sample schemas in detail
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log('🔍 DETAILED COMPARISON (sample schemas)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const sampleSchemas = tsJsonKeys.slice(0, 5);
  for (const schemaName of sampleSchemas) {
    console.log(`\n📋 Schema: ${schemaName}`);

    const tsJsonSchema = tsJsonSchemas[schemaName];
    const customSchema = customSchemas[schemaName];

    if (!customSchema) {
      console.log('   ❌ Missing in custom generator');
      continue;
    }

    // Compare structure
    const tsJsonProps = Object.keys(tsJsonSchema as object).sort();
    const customProps = Object.keys(customSchema as object).sort();

    console.log(`   ts-json-schema properties: ${tsJsonProps.join(', ')}`);
    console.log(`   custom generator properties: ${customProps.join(', ')}`);

    // Check if types match
    if (
      (tsJsonSchema as { type?: string }).type !==
      (customSchema as { type?: string }).type
    ) {
      console.log(
        `   ⚠️  Type mismatch: ${(tsJsonSchema as { type?: string }).type} vs ${(customSchema as { type?: string }).type}`,
      );
    }

    // Check required fields
    const tsJsonRequired = (
      (tsJsonSchema as { required?: string[] }).required || []
    ).sort();
    const customRequired = (
      (customSchema as { required?: string[] }).required || []
    ).sort();

    if (JSON.stringify(tsJsonRequired) !== JSON.stringify(customRequired)) {
      console.log(`   ⚠️  Required fields differ`);
      console.log(`      ts-json: ${tsJsonRequired.join(', ') || 'none'}`);
      console.log(`      custom: ${customRequired.join(', ') || 'none'}`);
    }
  }

  // Performance summary
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log('⚡ PERFORMANCE SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  return { missingInCustom, missingInTsJson };
}

async function main() {
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║   Schema Generator Comparison                 ║');
  console.log('╚═══════════════════════════════════════════════╝');

  try {
    // Load staged spec
    const stagedContent = readFileSync(CONFIG.stagedSpec, 'utf-8');
    const stagedSpec = JSON.parse(stagedContent);
    const stagedSchemas = stagedSpec.components?.schemas || {};

    // Run both generators
    const tsJsonResult = await testTsJsonSchemaGenerator();
    const customResult = await testCustomGenerator();

    // Compare
    const { missingInCustom } = compareSchemas(
      tsJsonResult.schemas,
      customResult.schemas,
      stagedSchemas,
    );

    console.log(
      `\n📦 ts-json-schema-generator: ${tsJsonResult.duration.toFixed(0)}ms`,
    );
    console.log(`⚡ Custom generator: ${customResult.duration.toFixed(0)}ms`);

    const speedup = tsJsonResult.duration / customResult.duration;
    const percent = (
      (1 - customResult.duration / tsJsonResult.duration) *
      100
    ).toFixed(1);

    if (speedup > 1) {
      console.log(
        `\n🚀 Custom generator is ${speedup.toFixed(1)}x faster (${percent}% speedup)`,
      );
    } else {
      console.log(
        `\n📉 Custom generator is ${(1 / speedup).toFixed(1)}x slower`,
      );
    }

    // Quality assessment
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log('🏁 QUALITY ASSESSMENT');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const coverage =
      ((tsJsonResult.schemaCount - missingInCustom.length) /
        tsJsonResult.schemaCount) *
      100;

    if (coverage > 95) {
      console.log(`✅ Excellent coverage: ${coverage.toFixed(1)}%`);
      console.log('   Custom generator is production-ready!');
    } else if (coverage > 80) {
      console.log(`⚠️  Good coverage: ${coverage.toFixed(1)}%`);
      console.log(
        `   Missing ${missingInCustom.length} schemas need implementation`,
      );
    } else {
      console.log(`❌ Poor coverage: ${coverage.toFixed(1)}%`);
      console.log('   Needs significant work before production use');
    }

    // Save outputs for manual inspection
    writeFileSync(
      '/tmp/schemas-ts-json.json',
      JSON.stringify(tsJsonResult.schemas, null, 2),
    );
    writeFileSync(
      '/tmp/schemas-custom.json',
      JSON.stringify(customResult.schemas, null, 2),
    );

    console.log(`\n📄 Output files for inspection:`);
    console.log(`   /tmp/schemas-ts-json.json`);
    console.log(`   /tmp/schemas-custom.json`);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
