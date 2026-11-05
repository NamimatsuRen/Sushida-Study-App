import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('node_modules/ts-fsrs/package.json', root), 'utf8'));
if (pkg.version !== '5.4.2') throw new Error('Expected pinned ts-fsrs 5.4.2');
const target = new URL('dist/vendor/', root);
const source = readFileSync(new URL('node_modules/ts-fsrs/dist/index.mjs', root), 'utf8').replace(/^\/\/# sourceMappingURL=.*$/m, '');
const files = { 'ts-fsrs.mjs': '// ts-fsrs 5.4.2 (FSRS-6). MIT; see ts-fsrs.LICENSE.txt.\n' + source, 'ts-fsrs.LICENSE.txt': readFileSync(new URL('node_modules/ts-fsrs/LICENSE', root), 'utf8') };
if (process.argv.includes('--check')) {
  for (const [name, expected] of Object.entries(files)) if (readFileSync(new URL(name, target), 'utf8') !== expected) throw new Error(`Vendored file differs: ${name}`);
  console.log('Verified pinned ts-fsrs source and license.');
} else {
  mkdirSync(target, { recursive: true });
  for (const [name, contents] of Object.entries(files)) writeFileSync(new URL(name, target), contents);
  console.log('Vendored ts-fsrs 5.4.2 and its MIT license.');
}
