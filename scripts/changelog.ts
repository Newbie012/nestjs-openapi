import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INTENTS = '.changeset';
const CHANGELOG = 'CHANGELOG.md';

const { name, version } = JSON.parse(readFileSync('package.json', 'utf8')) as {
  name: string;
  version: string;
};
const release = `${name}@${version}`;

// `pnpm version -r` writes the section for the release it applied
const sectionPath = join(
  INTENTS,
  'changelogs',
  `${release.replace('/', '!')}.md`,
);
if (!existsSync(sectionPath)) {
  console.error(`${sectionPath} is missing; run \`pnpm version -r\` first.`);
  process.exit(1);
}
const section = readFileSync(sectionPath, 'utf8').trim();

const changelog = readFileSync(CHANGELOG, 'utf8');
if (changelog.includes(`\n## ${version}\n`)) {
  console.log(`${CHANGELOG} already has ${version}.`);
} else {
  const [title, ...rest] = changelog.split('\n');
  const body = rest.join('\n').trimStart();
  writeFileSync(CHANGELOG, `${title}\n\n${section}\n\n${body}`);
  console.log(`${CHANGELOG}: added ${version}.`);
}

// The ledger lists the intents each release spent
const ledger = readFileSync(join(INTENTS, 'ledger.yaml'), 'utf8').split('\n');
const start = ledger.findIndex(
  (line) => line.replace(/"/g, '') === `${release}:`,
);
if (start === -1) {
  console.error(`.changeset/ledger.yaml has no entry for ${release}.`);
  process.exit(1);
}
const spent: string[] = [];
for (const line of ledger.slice(start + 1)) {
  if (/^\S/.test(line)) break;
  const intent = /^ {4}- (.+)$/.exec(line)?.[1];
  if (intent) spent.push(intent);
}
const files = spent
  .map((intent) => join(INTENTS, `${intent}.md`))
  .filter((file) => existsSync(file));
for (const file of files) rmSync(file);
console.log(`Removed ${files.length} spent change intents.`);
