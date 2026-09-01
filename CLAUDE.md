# wavemark

Tiny zero-dependency avatar library: any string is hashed into 3–5 wave sources, and the avatar is the interference pattern drawn as nodal lines. Deterministic: same name, same avatar, forever.

## Hard rules

- `SPEC.md` is the source of truth. Read it before writing any code.
- The reference implementation in `SPEC.md` is frozen: never change a numeric constant, a palette value, a formula, or the order of `rnd()` calls in `makeParams`. These define both the approved aesthetic and determinism — reordering `rnd()` calls silently changes every user's avatar.
- Exactly three styles: `nodal` (default), `pen`, `halo`. Never add styles or API options beyond what `SPEC.md` specifies.
- Zero runtime dependencies, ever. ESM output with bundled types.
- Never publish to npm, create tags, or push releases. The owner does that.
- If a spec requirement seems wrong or ambiguous, ask before deviating.

## Commands

Node 24 (tests and scripts use Node's native TypeScript type stripping; the pixel fixtures were recorded on Node 24 / V8).

| Command | What it does |
| --- | --- |
| `npm install` | Dev dependencies only (esbuild, TypeScript, @types/node). |
| `npm run typecheck` | `tsc -p tsconfig.json` over `src/`, `demo/`, `test/`, `scripts/`. |
| `npm test` | `node --test "test/*.test.ts"` — determinism against the committed fixtures, avalanche sanity, API contract, zero-deps / package hygiene. |
| `npm run build` | `dist/wavemark.js` (minified ESM + map) via esbuild, `dist/types/` via `tsc -p tsconfig.build.json`, `demo/app.js` via esbuild; prints min+gzip size (warns above 3.5 KB). |
| `npm run dev` | esbuild watch + static server; open http://localhost:5173/demo/. |
| `npm run hero` | Renders `docs/hero.png` (the README hero) through `renderPixels` plus a tiny PNG encoder on Node's zlib. Rerun after editing `scripts/hero.ts`; commit the PNG. |
| `npm run check` | `typecheck` + `test` + `build`. Run before declaring work done. CI runs the same plus `npm pack --dry-run`. |
| `npm run test:fixtures` | Regenerates `test/fixtures/*.json`. **Never run casually** — a fixture mismatch means the math changed; fix the code, not the fixture. |
| `npm pack --dry-run` | Lists the tarball: only `dist/`, `README.md`, `LICENSE`, `package.json` (`prepack` builds first). |

## Layout

- `src/core/` — the frozen math, one module per SPEC.md section: `hash.ts`, `palettes.ts`, `params.ts`, `field.ts`, `paint.ts`. Only structural adaptation is allowed (types, `paint` writing to a buffer instead of calling `putImageData`).
- `src/render.ts` — glue: `STYLES`, `normalizeName`, `normalizeStyle`, `createRenderer`, and the headless `renderPixels(name, S, options, t)` that returns exactly the RGBA bytes `wavemark()` hands to `putImageData`. Used by tests and fixtures.
- `src/types.ts` — the public types from SPEC.md. `src/index.ts` — the public API (`wavemark`, `wavemark.toDataURL`), the rAF breathe loop, `prefers-reduced-motion`, and the per-canvas handle registry.
- `demo/` — `index.html`, `style.css`, `app.ts`. `app.ts` imports `'wavemark'` (resolved to `src/index.ts` via tsconfig `paths`) and is bundled to `demo/app.js` (gitignored). Deployed to GitHub Pages by `.github/workflows/pages.yml`.
- `docs/` — `hero.png`, the README hero image. Generated, not hand-edited: `npm run hero`.
- `test/` — `*.test.ts` suites; `helpers/fake-dom.ts` (canvas / rAF / matchMedia fake for API tests), `helpers/snapshot.ts` (defines exactly what the fixtures pin); `fixtures/` (committed).
- `scripts/` — `build.ts`, `dev.ts`, `fixtures.ts`, `hero.ts` (renders `docs/hero.png`).
- `dist/` — build output, gitignored, what gets published: `wavemark.js` (+ map) and `types/{index,types}.d.ts`.
- `.github/workflows/` — `ci.yml` (typecheck, test, build, pack dry-run on Node 24), `pages.yml` (builds and deploys `demo/` to GitHub Pages).
- `tsconfig.json` (typecheck everything, no emit), `tsconfig.build.json` (declaration emit for `src/` only).
- `.claude/launch.json` — launch config for Claude Code's browser preview: `npm run dev` on port 5173 (the playground is at `/demo/`).

## Conventions

- TypeScript everywhere, `strict`, `verbatimModuleSyntax`, `erasableSyntaxOnly` (so Node can strip types: no enums, no parameter properties). Relative imports use the `.ts` extension; tsc leaves them as-is in the emitted `.d.ts`, so `scripts/build.ts` keeps only the public `index.d.ts` + `types.d.ts` and rewrites their specifiers to `.js`.
- Tests are `node:test`; no test framework dependencies.
- `makeParams` keeps the reference's `name || 'anonymous'` verbatim, which only catches `''`. The SPEC behavior rule (empty **or whitespace-only** → `'anonymous'`) is implemented in `normalizeName` (`src/render.ts`) at the public-API boundary; the SPEC's parenthetical "the reference implementation already does this" is inaccurate for whitespace-only input. Non-blank names are hashed untrimmed.
- The demo supersamples small avatars (offscreen render + `drawImage` with `imageSmoothingQuality: 'high'`) because the renderer has no anti-aliasing and browser canvas minification aliases. Pen is rendered at device resolution since its hairline is in backing pixels.
- Keep `README.md` and this file in sync with the npm scripts whenever they change.
