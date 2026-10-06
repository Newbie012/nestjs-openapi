#!/usr/bin/env node
/**
 * Generates a NestJS project shaped like a large monorepo app, to measure
 * generation time and memory:
 *
 * - DTO files with nested references across files (imports form a tree),
 *   enums, mapped types
 *   (PartialType / OmitType) and @ApiProperty metadata;
 * - non-exported classes whose names collide across files;
 * - files ts-json-schema-generator crashes on (`z.infer<typeof schema>`),
 *   when zod is installed;
 * - controllers with params, queries, bodies and response decorators.
 *
 * Usage: node scripts/benchmark/large-project.mjs [outDir] [dtoFiles] [controllers]
 * Defaults: .bench-large 300 150
 */
import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../..');
const outDir = resolve(repoRoot, process.argv[2] ?? '.bench-large');
const DTO_FILES = Number(process.argv[3] ?? 300);
const CONTROLLERS = Number(process.argv[4] ?? 150);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, 'src/dto'), { recursive: true });
mkdirSync(join(outDir, 'src/controllers'), { recursive: true });

// zod is not a dependency of this repo; link it if pnpm installed it anyway
const zodPath = [
  join(repoRoot, 'node_modules/zod'),
  ...(existsSync(join(repoRoot, 'node_modules/.pnpm'))
    ? (await import('node:fs'))
        .readdirSync(join(repoRoot, 'node_modules/.pnpm'))
        .filter((entry) => entry.startsWith('zod@'))
        .map((entry) => join(repoRoot, 'node_modules/.pnpm', entry, 'node_modules/zod'))
    : []),
].find((candidate) => existsSync(candidate));
if (zodPath) {
  mkdirSync(join(outDir, 'node_modules'), { recursive: true });
  symlinkSync(zodPath, join(outDir, 'node_modules/zod'));
}

writeFileSync(
  join(outDir, 'tsconfig.json'),
  JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        strictPropertyInitialization: false,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        skipLibCheck: true,
        noEmit: true,
      },
      include: ['src/**/*.ts'],
    },
    null,
    2,
  ),
);

for (let f = 0; f < DTO_FILES; f++) {
  const crashes = zodPath !== undefined && f % 25 === 0;
  const lines = [
    "import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';",
  ];
  if (crashes) {
    lines.push("import { z } from 'zod';", 'const metaSchema = z.object({ a: z.string() });');
  }
  // Imports form a tree (each file imports a parent), so a file's transitive
  // imports stay a handful deep, as in a typical codebase
  const parent = Math.floor((f - 1) / 3);
  if (f > 0) lines.push(`import { Item${parent}Dto } from './file${parent}.dto';`);
  // Non-exported class whose name collides across files
  if (f % 10 === 0) {
    lines.push(`class SharedDetailDto {`, `  @ApiProperty() field${f}: string;`, `}`);
  }
  lines.push(`export enum Status${f} {`, `  A = 'a${f}',`, `  B = 'b${f}',`, `}`);
  for (let c = 0; c < 5; c++) {
    lines.push(`export class Entity${f}_${c}Dto {`);
    lines.push(`  @ApiProperty({ description: 'id of ${f}_${c}' }) id: string;`);
    lines.push(`  @ApiPropertyOptional({ example: ${c} }) count?: number;`);
    lines.push(`  @ApiProperty({ enum: Status${f} }) status: Status${f};`);
    if (c > 0) {
      lines.push(`  @ApiProperty({ type: () => Entity${f}_${c - 1}Dto }) previous: Entity${f}_${c - 1}Dto;`);
    }
    if (f % 10 === 0 && c === 0) {
      lines.push(`  @ApiProperty({ type: () => SharedDetailDto }) detail: SharedDetailDto;`);
    }
    if (crashes && c === 1) lines.push('  meta: z.infer<typeof metaSchema>;');
    lines.push('}');
  }
  lines.push(`export class Item${f}Dto {`);
  lines.push(`  @ApiProperty() entity: Entity${f}_4Dto;`);
  if (f > 0) lines.push(`  @ApiPropertyOptional() parent?: Item${parent}Dto;`);
  lines.push('}');
  lines.push(`export class Update${f}Dto extends PartialType(Entity${f}_2Dto) {}`);
  lines.push(`export class Create${f}Dto extends OmitType(Entity${f}_2Dto, ['id'] as const) {}`);
  writeFileSync(join(outDir, `src/dto/file${f}.dto.ts`), `${lines.join('\n')}\n`);
}

const controllerNames = [];
for (let k = 0; k < CONTROLLERS; k++) {
  const imports = new Set();
  const methods = [];
  for (let m = 0; m < 4; m++) {
    const f = (k * 4 + m) % DTO_FILES;
    imports.add(`import { Create${f}Dto, Entity${f}_2Dto, Item${f}Dto, Update${f}Dto } from '../dto/file${f}.dto';`);
    methods.push(
      [
        `  @Get('m${m}/:id')`,
        `  @ApiOkResponse({ type: Item${f}Dto })`,
        `  @ApiNotFoundResponse({ description: 'Not found' })`,
        `  @ApiQuery({ name: 'limit', required: false, example: 10 })`,
        `  get${m}(@Param('id') _id: string, @Query('q') _q?: string): Item${f}Dto {`,
        `    return null as never;`,
        `  }`,
        ``,
        `  @Post('m${m}')`,
        `  create${m}(@Body() body: Create${f}Dto): Entity${f}_2Dto {`,
        `    return body as never;`,
        `  }`,
        ``,
        `  @Patch('m${m}/:id')`,
        `  update${m}(@Param('id') _id: string, @Body() body: Update${f}Dto): Entity${f}_2Dto {`,
        `    return body as never;`,
        `  }`,
      ].join('\n'),
    );
  }
  writeFileSync(
    join(outDir, `src/controllers/c${k}.controller.ts`),
    [
      "import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';",
      "import { ApiNotFoundResponse, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';",
      ...imports,
      '',
      `@ApiTags('Group${k % 12}')`,
      `@Controller('c${k}')`,
      `export class Controller${k} {`,
      methods.join('\n\n'),
      '}',
      '',
    ].join('\n'),
  );
  controllerNames.push(`Controller${k}`);
}

writeFileSync(
  join(outDir, 'src/app.module.ts'),
  [
    "import { Module } from '@nestjs/common';",
    ...controllerNames.map((name, k) => `import { ${name} } from './controllers/c${k}.controller';`),
    '',
    `@Module({ controllers: [${controllerNames.join(', ')}] })`,
    'export class AppModule {}',
    '',
  ].join('\n'),
);

// A plain config object, so every version of the CLI can load it
writeFileSync(
  join(outDir, 'openapi.config.ts'),
  `export default {
  output: 'openapi.generated.json',
  files: {
    entry: 'src/app.module.ts',
    tsconfig: 'tsconfig.json',
    dtoGlob: 'src/**/*.dto.ts',
  },
  openapi: { info: { title: 'Large benchmark', version: '1.0.0' } },
};
`,
);

console.log(
  `Generated ${DTO_FILES} DTO files and ${CONTROLLERS} controllers in ${outDir}${zodPath ? '' : ' (zod not found: no crashing files)'}`,
);
