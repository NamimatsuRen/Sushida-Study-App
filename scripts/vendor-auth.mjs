import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(readFileSync(root + 'node_modules/@supabase/supabase-js/package.json', 'utf8'));
if (pkg.version !== '2.119.0') throw new Error('Expected pinned Supabase client 2.119.0');
const output = await build({ stdin: { contents: "export { createClient } from '@supabase/supabase-js';", resolveDir: root }, bundle: true, write: false, metafile: true, minify: true, platform: 'browser', format: 'esm', target: 'es2022', legalComments: 'eof' });
const packages = new Set(Object.keys(output.metafile.inputs).filter(p => p.includes('node_modules/')).map(p => p.split('node_modules/').at(-1)).map(p => p.startsWith('@') ? p.split('/').slice(0, 2).join('/') : p.split('/')[0]));
const licenses = [...packages].sort().map(name => {
  const dir = root + 'node_modules/' + name + '/';
  const info = JSON.parse(readFileSync(dir + 'package.json', 'utf8'));
  const file = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'License'].find(file => existsSync(dir + file));
  if (!file) throw new Error(`Missing license: ${name}`);
  return `${name}@${info.version}\n${readFileSync(dir + file, 'utf8')}\n`;
}).join('\n---\n\n');
const files = { 'supabase.mjs': '// Supabase JS 2.119.0. See supabase.LICENSE.txt.\n' + output.outputFiles[0].text, 'supabase.LICENSE.txt': licenses };
const target = root + 'dist/vendor/';
if (!process.argv.includes('--check')) mkdirSync(target, { recursive: true });
for (const [name, text] of Object.entries(files)) {
  if (process.argv.includes('--check')) { if (readFileSync(target + name, 'utf8') !== text) throw new Error(`Vendor differs: ${name}`); }
  else writeFileSync(target + name, text);
}
console.log('Verified Supabase browser bundle and bundled package licenses.');
