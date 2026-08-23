// Build: library bundle + type declarations + demo bundle + size report.
//
//   dist/wavemark.js        minified ESM (+ sourcemap) — the published artifact
//   dist/types/**/*.d.ts    declarations emitted by tsc from src/
//   demo/app.js             the playground, bundled from demo/app.ts (+ library)
//
// Run with `npm run build`. Warns (but does not fail) if the library exceeds
// the 3.5 KB min+gzip soft limit from SPEC.md.

import { build, type BuildOptions } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
  name: string;
  version: string;
};

const common: BuildOptions = { bundle: true, format: 'esm', target: 'es2020', legalComments: 'none' };

await rm('dist', { recursive: true, force: true }); // never ship stale files
await mkdir('dist', { recursive: true });

await build({
  ...common,
  entryPoints: ['src/index.ts'],
  outfile: 'dist/wavemark.js',
  minify: true,
  sourcemap: true,
  banner: { js: `/*! ${pkg.name} v${pkg.version} | MIT */` },
});

// Declarations. tsc emits one .d.ts per module and keeps the source's `./x.ts`
// specifiers; keep only the public surface (index + types) and rewrite the
// specifiers to `./x.js` so every resolver (and older TypeScript) is happy.
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
execFileSync(process.execPath, [tsc, '-p', 'tsconfig.build.json'], { stdio: 'inherit' });
const PUBLIC_DTS = new Set(['index.d.ts', 'types.d.ts']);
for (const file of await readdir('dist/types', { recursive: true })) {
  const path = join('dist/types', file);
  if (!file.endsWith('.d.ts')) continue;
  if (!PUBLIC_DTS.has(file)) { await rm(path); continue; }
  const dts = await readFile(path, 'utf8');
  await writeFile(path, dts.replace(/(from\s+['"]\.{1,2}\/[^'"]+)\.ts(['"])/g, '$1.js$2'));
}
await rm('dist/types/core', { recursive: true, force: true });

await build({
  ...common,
  entryPoints: ['demo/app.ts'],
  outfile: 'demo/app.js',
  sourcemap: 'inline',
});

const js = await readFile('dist/wavemark.js');
const gz = gzipSync(js, { level: 9 }).length;
const kb = (n: number): string => (n / 1024).toFixed(2) + ' KB';
const WARN_BYTES = 3.5 * 1024;
console.log(`built dist/wavemark.js (+ .map), dist/types/, demo/app.js`);
console.log(`size: dist/wavemark.js  min ${kb(js.length)}  min+gzip ${kb(gz)}  (target <= ~3 KB, warn > 3.5 KB)`);
if (gz > WARN_BYTES) {
  console.warn(`::warning::wavemark core is ${gz} bytes (${kb(gz)}) min+gzip, above the ${WARN_BYTES}-byte soft limit`);
}
