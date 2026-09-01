// Renders docs/hero.png, the README hero: a row of avatars in all three styles
// on a transparent background, so it reads on GitHub's light and dark themes.
// It runs the real library headlessly (renderPixels) and writes the PNG with
// Node's zlib — no canvas, no extra dependency. Run with `npm run hero` and
// commit the result; edit ROW below to change what is shown.
//
// Sizes are in CSS pixels, baked at 2× for high-DPI screens. Each avatar is
// rendered at 4× its final backing size and box-filtered down, because the
// renderer has no anti-aliasing (the demo does the same with drawImage).

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';
import { renderPixels } from '../src/render.ts';
import type { WavemarkStyle } from '../src/types.ts';

const OUT = fileURLToPath(new URL('../docs/hero.png', import.meta.url));

/** What to draw, left to right: [name, style]. */
const ROW: readonly [string, WavemarkStyle][] = [
  ['ankit', 'nodal'], ['ada', 'pen'], ['grace', 'nodal'], ['turing', 'halo'],
  ['hopper', 'nodal'], ['wavemark', 'pen'], ['dijkstra', 'nodal'], ['noether', 'halo'],
];
const AVATAR = 96; // CSS px per avatar
const GAP = 24;    // CSS px between avatars
const PAD = 12;    // CSS px around the row
const DPR = 2;     // device pixel ratio baked into the PNG
const SS = 4;      // supersampling factor per avatar

/**
 * Box-filter an S×S straight-alpha RGBA image down by an integer factor f,
 * averaging premultiplied so the soft rim doesn't fringe.
 */
function downsample(src: Uint8ClampedArray, S: number, f: number): Uint8ClampedArray {
  const s = S / f, n = f * f;
  const out = new Uint8ClampedArray(s * s * 4);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) {
      const p = ((y * f + j) * S + x * f + i) * 4;
      const al = src[p + 3];
      r += src[p] * al; g += src[p + 1] * al; b += src[p + 2] * al; a += al;
    }
    const q = (y * s + x) * 4;
    if (a > 0) { out[q] = r / a; out[q + 1] = g / a; out[q + 2] = b / a; }
    out[q + 3] = a / n;
  }
  return out;
}

// ---- minimal PNG encoder: 8-bit RGBA, adaptive per-row filters, one IDAT ----

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Try all five PNG filters per row and keep the one with the smallest signed-magnitude sum (libpng's heuristic). */
function filterRows(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const stride = w * 4, bpp = 4;
  const out = new Uint8Array((stride + 1) * h);
  const cand = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const cur = rgba.subarray(y * stride, (y + 1) * stride);
    const prev = y ? rgba.subarray((y - 1) * stride, y * stride) : null;
    let best = Infinity;
    for (let f = 0; f < 5; f++) {
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? cur[i - bpp] : 0;
        const b = prev ? prev[i] : 0;
        const c = prev && i >= bpp ? prev[i - bpp] : 0;
        const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
        const v = (cur[i] - pred) & 255;
        cand[i] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (score < best) {
        best = score;
        out[y * (stride + 1)] = f;
        out.set(cand, y * (stride + 1) + 1);
      }
    }
  }
  return out;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([head, body, tail]);
}

function encodePng(w: number, h: number, rgba: Uint8ClampedArray): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type 6 = RGBA; compression, filter and interlace stay 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(filterRows(rgba, w, h), { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

// ---- compose ----

const size = AVATAR * DPR;
const W = (PAD * 2 + ROW.length * AVATAR + (ROW.length - 1) * GAP) * DPR;
const H = (PAD * 2 + AVATAR) * DPR;
const img = new Uint8ClampedArray(W * H * 4); // starts fully transparent
ROW.forEach(([name, style], i) => {
  const px = downsample(renderPixels(name, size * SS, { style }), size * SS, SS);
  const ox = (PAD + i * (AVATAR + GAP)) * DPR, oy = PAD * DPR;
  for (let y = 0; y < size; y++) img.set(px.subarray(y * size * 4, (y + 1) * size * 4), ((oy + y) * W + ox) * 4);
});

const png = encodePng(W, H, img);
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, png);
console.log(`wrote docs/hero.png  ${W}×${H} px  (${ROW.length} avatars at ${AVATAR} CSS px, ${DPR}×)  ${(png.length / 1024).toFixed(1)} KB`);
