// Dev server for the playground: rebuilds demo/app.js on every change and
// serves the repo root at http://localhost:5173/demo/. Zero extra deps — this
// is esbuild's built-in watch + static file server.

import { context } from 'esbuild';

const ctx = await context({
  entryPoints: ['demo/app.ts'],
  outfile: 'demo/app.js',
  bundle: true,
  format: 'esm',
  target: 'es2020',
  sourcemap: 'inline',
});

await ctx.watch();
const { port } = await ctx.serve({ servedir: '.', host: '127.0.0.1', port: Number(process.env.PORT) || 5173 });
console.log(`wavemark demo: http://localhost:${port}/demo/`);
