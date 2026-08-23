# wavemark — build spec v0.1

## What this is

`wavemark` is a tiny open source avatar library. It hashes any string (a username, an email, a user id) into 3–5 coherent wave sources, sums their interference field over a disk, and draws the avatar from that field. Same string in, same avatar out, forever. Nothing is stored; the picture is recomputed from the name.

A working prototype already exists and its look has been approved. The reference implementation in this file was extracted from that prototype. It is the source of truth for all visual output. Your job is packaging, tooling, demo, and tests — not redesigning the visuals.

## Non-negotiables

1. Do not change any numeric constant, palette value, or formula in the reference implementation. They define the approved aesthetic.
2. Do not reorder, add, or remove `rnd()` calls in `makeParams`. The call order defines determinism; changing it silently changes every user's avatar.
3. Exactly three styles ship in v0.1: `nodal` (default), `pen`, `halo`. No more.
4. Zero runtime dependencies. Dev dependencies are fine.
5. The public API is exactly what's specified below. No extra options in v0.1.

## Package requirements

* npm name: `wavemark`, version `0.1.0`, license MIT.
* ESM output with bundled TypeScript types. Author in TypeScript or in JS with a hand-written `.d.ts` — your choice; the published artifact must be dependency-free ESM plus types.
* `"sideEffects": false`, a proper `exports` map, and a `files` whitelist in package.json.
* Must work from a CDN with no build step: `<script type="module">import { wavemark } from 'https://cdn.jsdelivr.net/npm/wavemark/+esm'</script>` (jsDelivr/unpkg pick this up automatically once published; just don't break ESM.)
* Size target: core ≤ ~3 KB min+gzip. Soft limit; warn if exceeded, don't contort the code to hit it.
* Keywords: avatar, identicon, generative-art, wave-interference, canvas, zero-dependency.
* Do NOT publish to npm or create releases. The owner publishes manually.

## Public API

```ts
type WavemarkStyle = 'nodal' | 'pen' | 'halo';

type RGB = [number, number, number];

interface WavemarkOptions {
  /** Rendering style. Default: 'nodal'. */
  style?: WavemarkStyle;
  /** Slow in-place phase oscillation. Default: false. */
  breathe?: boolean;
  /** Override the hash-picked palette: [darkest, mid, lightest]. */
  palette?: [RGB, RGB, RGB];
}

interface WavemarkHandle {
  /** Stops the breathe animation. No-op if breathe was false. */
  stop(): void;
}

/**
 * Draws the avatar into the given canvas at its current backing resolution
 * (canvas.width × canvas.height; use a square canvas). The caller controls
 * display size via CSS. Calling wavemark again on the same canvas stops any
 * previous animation on it first.
 */
export function wavemark(
  name: string,
  canvas: HTMLCanvasElement,
  options?: WavemarkOptions
): WavemarkHandle;

/**
 * Renders offscreen and returns a PNG data URL. `size` is the CSS pixel size;
 * render internally at 2× for sharpness. Default size: 64. Browser only —
 * throw a clear Error if `document` is unavailable.
 */
export namespace wavemark {
  function toDataURL(name: string, size?: number, options?: WavemarkOptions): string;
}
```

Behavior details:

* Empty or whitespace-only `name` falls back to the string `'anonymous'` (the reference implementation already does this).
* `breathe: true` animates at ~30 fps by skipping every other `requestAnimationFrame`.
* If the user agent reports `prefers-reduced-motion: reduce`, render a static frame even when `breathe: true` (still return a handle whose `stop()` is a no-op).
* The avatar is a circle: pixels outside the disk get alpha 0, with the soft edge from the reference mask. Recommend `border-radius: 50%` in docs anyway.

## Reference implementation (frozen)

Adapt structure freely (modules, TS types, typed arrays reuse), but every formula, constant, and `rnd()` call order below must survive verbatim.

```js
// ---------- deterministic seed ----------

function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return (h1 ^ h2 ^ h3 ^ h4) >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- palettes: [darkest, mid, lightest] ----------

const PALETTES = [
  [[30, 27, 75],  [99, 102, 241], [224, 231, 255]],
  [[4, 47, 46],   [20, 184, 166], [204, 251, 241]],
  [[67, 20, 7],   [249, 115, 22], [255, 237, 213]],
  [[76, 5, 25],   [244, 63, 94],  [255, 228, 230]],
  [[5, 46, 22],   [34, 197, 94],  [220, 252, 231]],
  [[46, 16, 101], [168, 85, 247], [243, 232, 255]],
  [[23, 37, 84],  [59, 130, 246], [219, 234, 254]],
  [[28, 25, 23],  [245, 158, 11], [254, 243, 199]],
  [[8, 51, 68],   [6, 182, 212],  [207, 250, 254]],
  [[15, 23, 42],  [100, 116, 139],[241, 245, 249]],
];

// 3-stop linear ramp through a palette, t in [0, 1]
function ramp(pal, t) {
  t = Math.min(1, Math.max(0, t));
  const s = t < 0.5 ? 0 : 1;
  const u = (t - s * 0.5) * 2;
  const A = pal[s], B = pal[s + 1];
  return [
    A[0] + (B[0] - A[0]) * u,
    A[1] + (B[1] - A[1]) * u,
    A[2] + (B[2] - A[2]) * u,
  ];
}

// ---------- name -> wave sources ----------
// rnd() CALL ORDER IS FROZEN: n, then per source (ang, rad, wl, phi, w,
// wa-magnitude, wa-sign), then palette index. Changing it changes every avatar.

function makeParams(name) {
  const rnd = mulberry32(cyrb128(name || 'anonymous'));
  const n = 3 + Math.floor(rnd() * 3);           // 3–5 sources
  const src = [];
  for (let i = 0; i < n; i++) {
    const ang = rnd() * Math.PI * 2;             // source direction
    const rad = 0.15 + rnd() * 1.2;              // distance from center, in R units
    const wl  = 0.3 + rnd() * 0.55;              // wavelength, in R units
    src.push({
      x: Math.cos(ang) * rad,
      y: Math.sin(ang) * rad,
      k: (2 * Math.PI) / wl,                     // wavenumber
      phi: rnd() * Math.PI * 2,                  // static phase
      w: 0.4 + rnd() * 0.5,                      // breathe frequency (rad/s)
      wa: (0.5 + rnd() * 0.6) * (rnd() < 0.5 ? -1 : 1), // breathe amplitude ± (rad)
    });
  }
  return {
    src,
    pal: PALETTES[Math.floor(rnd() * PALETTES.length)],
    g: 1.6 / Math.sqrt(n),                       // tone-mapping gain
  };
}

// ---------- field over an S×S pixel disk ----------
// Coordinates are normalized: center (cx, cx) with cx = (S-1)/2, radius R = S/2,
// so dx, dy ∈ [-1, 1]. Precompute per-source k·distance and amplitude falloff
// once per (name, S); reuse across breathe frames.

function buildField(pr, S) {
  const N = S * S, m = pr.src.length;
  const kd = [], am = [];
  const mask = new Float32Array(N);
  const R = S / 2, cx = (S - 1) / 2;
  for (let s = 0; s < m; s++) { kd.push(new Float32Array(N)); am.push(new Float32Array(N)); }
  let p = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++, p++) {
    const dx = (x - cx) / R, dy = (y - cx) / R;
    const rr = Math.sqrt(dx * dx + dy * dy);
    mask[p] = rr > 1 ? 0 : (rr > 0.985 ? (1 - (rr - 0.985) / 0.015) : 1); // soft rim
    for (let s = 0; s < m; s++) {
      const ddx = dx - pr.src[s].x, ddy = dy - pr.src[s].y;
      const d = Math.sqrt(ddx * ddx + ddy * ddy);
      kd[s][p] = pr.src[s].k * d;
      am[s][p] = 1 / (1 + 0.6 * d);              // gentle amplitude falloff
    }
  }
  return { kd, am, mask, S, N, field: new Float32Array(N) };
}

// t = 0 gives the static avatar; breathing passes t = seconds elapsed.
function computeField(fb, pr, t) {
  const f = fb.field;
  f.fill(0);
  for (let s = 0; s < pr.src.length; s++) {
    const sc = pr.src[s];
    const ph = sc.phi + (t ? sc.wa * Math.sin(t * sc.w) : 0);
    const K = fb.kd[s], A = fb.am[s];
    for (let p = 0; p < fb.N; p++) f[p] += A[p] * Math.sin(K[p] - ph);
  }
}

// ---------- paint: three styles ----------
// v = raw field value; tt = 0.5 + 0.5 * tanh(v * g) maps it to [0, 1].
// All styles share: base color = tt < 0.5 ? ramp(pal, 0.10) : ramp(pal, 0.20)
// (faint two-tone shading by sign), line/accent color = ramp(pal, 0.95),
// final pixel = lerp(base, accent, intensity), alpha = mask * 255.

function paint(st, mode) {
  const d = st.img.data, f = st.field, mk = st.mask, g = st.g, S = st.S, N = st.N;
  const md = mode === 'nodal' ? 0 : mode === 'pen' ? 1 : 2; // 2 = halo
  const lwP = Math.max(1.1, S * 0.006);          // pen line width, sim pixels
  let p = 0, q = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++, p++, q += 4) {
    const m = mk[p];
    if (m <= 0) { d[q + 3] = 0; continue; }
    const v = f[p];
    const tt = 0.5 + 0.5 * Math.tanh(v * g);
    let it = 0;
    if (md === 0) {
      // NODAL: soft line where tt crosses 0.5 (the field's zero set)
      const dd = Math.abs(tt - 0.5);
      it = Math.max(0, Math.min(1, (0.055 - dd) / 0.028));
    } else if (md === 1) {
      // PEN: uniform-width hairline via gradient-normalized distance to zero set
      const x0 = x < 1 ? 1 : x > S - 2 ? S - 2 : x;
      const y0 = y < 1 ? 1 : y > S - 2 ? S - 2 : y;
      const pp = y0 * S + x0;
      const gx = f[pp + 1] - f[pp - 1];
      const gy = f[pp + S] - f[pp - S];
      const mag = Math.sqrt(gx * gx + gy * gy);
      const ds = Math.abs(v) / (mag * 0.5 + 1e-4); // ≈ distance to zero set, px
      it = ds >= lwP ? 0 : ds <= lwP * 0.4 ? 1 : 1 - (ds - lwP * 0.4) / (lwP * 0.6);
    } else {
      // HALO: nodal core plus a faint wide bloom
      const dd = Math.abs(tt - 0.5);
      const core = Math.max(0, Math.min(1, (0.055 - dd) / 0.028));
      const halo = Math.max(0, (0.16 - dd) / 0.16) * 0.22;
      it = Math.min(1, core + halo);
    }
    const b = tt < 0.5 ? st.n0 : st.n1;
    d[q]     = b[0] + (st.ac[0] - b[0]) * it;
    d[q + 1] = b[1] + (st.ac[1] - b[1]) * it;
    d[q + 2] = b[2] + (st.ac[2] - b[2]) * it;
    d[q + 3] = (m * 255) | 0;
  }
  st.ctx.putImageData(st.img, 0, 0);
}

// Derived colors, computed once per params (respect options.palette override here):
//   st.n0 = ramp(pal, 0.10)   st.n1 = ramp(pal, 0.20)   st.ac = ramp(pal, 0.95)
```

## Rendering pipeline summary

1. `makeParams(name)` — hash, seed PRNG, derive sources + palette + gain.
2. `buildField(params, S)` — S = canvas backing size; precompute per-pixel k·distance, amplitude, and the circular alpha mask.
3. `computeField(fb, params, t)` — sum the sine waves (t = 0 when static).
4. `paint(state, style)` — tone-map with tanh, apply the style's line intensity function, mix base/accent, write ImageData.
5. Breathe: rAF loop, render every other frame with t = elapsed seconds, phases oscillate as `phi + wa*sin(t*w)` so the pattern moves in place and always returns — identity never drifts.

## Repo layout

```
wavemark/
  src/           library source
  demo/          static playground, no build step, deployable to GitHub Pages as-is
  test/          determinism + API tests (vitest or node:test — your call)
  README.md      hero image/GIF placeholder at top, install, CDN one-liner,
                 API reference, short "how the physics works" section
  LICENSE        MIT
  package.json
  CLAUDE.md      already present — keep it updated with build/test commands
  SPEC.md        this file
```

## Demo requirements

The playground is the marketing surface. It must include: a name input (live, debounced), three style buttons, a breathe toggle, a sample grid of ~12 names at ~60 px, and a mock comment-thread row showing 24 px avatars next to usernames — tiny sizes are where identicons earn their keep. It imports the actual library, not a copy of the math. Plain HTML/CSS/JS, works when served statically.

## Tests / acceptance criteria

1. Params determinism: for `['ankit', 'ada', 'grace', 'turing']`, a JSON snapshot of `makeParams` output (sources rounded to 6 decimals + palette index) matches committed fixtures exactly.
2. Pixel determinism: a hash of `getImageData` for `('ankit', 128px)` in each of the three styles matches a committed fixture in the CI environment. Note in the README that cross-engine floating point may differ in the last bits; determinism is guaranteed per engine, visual identity everywhere.
3. Avalanche sanity: `'ankit'` and `'ankita'` yield different seeds and different source sets.
4. API contract: default style is nodal; `stop()` halts the rAF loop; `toDataURL` returns a string starting with `data:image/png`; empty name behaves as `'anonymous'`.
5. Zero deps: `dependencies` in package.json is absent or empty.
6. Size: report min+gzip size of the core in CI output; warn above 3.5 KB.

## Out of scope for v0.1 — do not build

React/Vue/Svelte wrappers, SVG or server-side output, additional styles, a hosted image API, theming UI, CLI tools, publishing automation. These are all deliberate later phases.

## Definition of done

* [ ] Library builds to dependency-free ESM + types
* [ ] All acceptance tests pass
* [ ] Demo runs from a static server and shows all required elements
* [ ] README complete with usage, CDN snippet, API table, physics section
* [ ] `npm pack` output contains only the intended files
