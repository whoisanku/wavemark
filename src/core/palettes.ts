// ---------- palettes: [darkest, mid, lightest] ----------
// FROZEN (SPEC.md): do not change any palette value or the ramp formula.

import type { RGB } from '../types.ts';

export type Palette = [RGB, RGB, RGB];

export const PALETTES: readonly Palette[] = [
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

/** 3-stop linear ramp through a palette, t in [0, 1]. */
export function ramp(pal: Palette, t: number): RGB {
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

export interface Colors {
  /** base color where the field is negative */
  n0: RGB;
  /** base color where the field is positive */
  n1: RGB;
  /** line / accent color */
  ac: RGB;
}

/**
 * Derived colors, computed once per params. `pal` is the hash-picked palette
 * or the caller's `options.palette` override.
 */
export function deriveColors(pal: Palette): Colors {
  return { n0: ramp(pal, 0.10), n1: ramp(pal, 0.20), ac: ramp(pal, 0.95) };
}
