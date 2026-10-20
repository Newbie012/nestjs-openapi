import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const server = process.argv[2];
const index = readFileSync(join(server, 'src/controllers/index.ts'), 'utf8');
const names = [...index.matchAll(/^import \{ (\w+) \} from '([^']+)';/gm)];
const lines = [
  "import { Module } from '@nestjs/common';",
  ...names.map(([, name, from]) => `import { ${name} } from '${from}';`),
  '',
  `@Module({ controllers: [${names.map(([, name]) => name).join(', ')}] })`,
  'export class OpenApiEntryModule {}',
  '',
];
writeFileSync(join(server, 'src/openapi-entry.module.ts'), lines.join('\n'));
writeFileSync(
  join(server, 'openapi.config.ts'),
  `export default {
  output: 'openapi.generated.json',
  files: {
    entry: 'src/openapi-entry.module.ts',
    tsconfig: 'tsconfig.json',
    dtoGlob: 'src/**/*.dto.ts',
  },
  openapi: { info: { title: 'Real app', version: '1.0.0' } },
};
`,
);
console.log(`${names.length} controllers`);
