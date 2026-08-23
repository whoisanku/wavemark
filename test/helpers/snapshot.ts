// Shared by the tests and scripts/fixtures.ts so both sides agree on exactly
// what is snapshotted.

import { createHash } from 'node:crypto';
import { makeParams } from '../../src/core/params.ts';
import { PALETTES } from '../../src/core/palettes.ts';
import { renderPixels, STYLES } from '../../src/render.ts';
import type { WavemarkStyle } from '../../src/types.ts';

export const PARAM_NAMES = ['ankit', 'ada', 'grace', 'turing'] as const;
export const PIXEL_NAME = 'ankit';
export const PIXEL_SIZE = 128;

export interface PixelCase {
  name: string;
  size: number;
  styles: readonly WavemarkStyle[];
  /** breathe time in seconds; 0 = static */
  t: number;
}

/**
 * Every pixel case that gets a committed sha256. The first entry is SPEC.md's
 * acceptance case ('ankit', 128px, all three styles). The rest widen coverage:
 * four palettes instead of one, a 256px pen render where the `S * 0.006` line
 * width term is live (at 128px the 1.1px floor wins), and one breathe frame so
 * the `phi + wa*sin(t*w)` phase formula is pinned too.
 */
export const PIXEL_CASES: readonly PixelCase[] = [
  { name: PIXEL_NAME, size: PIXEL_SIZE, styles: STYLES, t: 0 },
  { name: 'ada', size: 128, styles: STYLES, t: 0 },
  { name: 'grace', size: 128, styles: STYLES, t: 0 },
  { name: 'turing', size: 128, styles: STYLES, t: 0 },
  { name: PIXEL_NAME, size: 256, styles: ['pen'], t: 0 },
  { name: PIXEL_NAME, size: 64, styles: STYLES, t: 1.5 },
];

export const caseKey = (c: Pick<PixelCase, 'name' | 'size' | 't'>): string =>
  `${c.name}@${c.size}` + (c.t ? `@t=${c.t}` : '');

const r6 = (v: number): number => Number(v.toFixed(6));

export interface ParamsSnapshot {
  sources: { x: number; y: number; k: number; phi: number; w: number; wa: number }[];
  /** index into PALETTES */
  palette: number;
  g: number;
}

/** JSON-stable snapshot of makeParams: sources rounded to 6 decimals, palette index, gain. */
export function paramsSnapshot(name: string): ParamsSnapshot {
  const pr = makeParams(name);
  return {
    sources: pr.src.map((s) => ({ x: r6(s.x), y: r6(s.y), k: r6(s.k), phi: r6(s.phi), w: r6(s.w), wa: r6(s.wa) })),
    palette: PALETTES.indexOf(pr.pal),
    g: r6(pr.g),
  };
}

/**
 * sha256 of the RGBA bytes wavemark() would hand to putImageData (not of a
 * canvas getImageData read-back, which premultiplies the soft rim).
 */
export function pixelHash(name: string, size: number, style: WavemarkStyle, t = 0): string {
  return createHash('sha256').update(renderPixels(name, size, { style }, t)).digest('hex');
}

export const sameBytes = (a: Uint8ClampedArray | null, b: Uint8ClampedArray | null): boolean =>
  !!a && !!b && a.length === b.length &&
  Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(Buffer.from(b.buffer, b.byteOffset, b.byteLength));
