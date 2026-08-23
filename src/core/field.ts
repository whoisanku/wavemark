// ---------- field over an S×S pixel disk ----------
// FROZEN (SPEC.md): do not change any constant or formula in this file.
// Coordinates are normalized: center (cx, cx) with cx = (S-1)/2, radius R = S/2,
// so dx, dy ∈ [-1, 1]. Precompute per-source k·distance and amplitude falloff
// once per (name, S); reuse across breathe frames.

import type { Params } from './params.ts';

export interface FieldBuffers {
  /** per-source k·distance, per pixel */
  kd: Float32Array[];
  /** per-source amplitude falloff, per pixel */
  am: Float32Array[];
  /** circular alpha mask with soft rim */
  mask: Float32Array;
  S: number;
  N: number;
  /** summed interference field (output of computeField) */
  field: Float32Array;
}

export function buildField(pr: Params, S: number): FieldBuffers {
  const N = S * S, m = pr.src.length;
  const kd: Float32Array[] = [], am: Float32Array[] = [];
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

/**
 * Sum the sine waves into `fb.field`.
 * t = 0 gives the static avatar; breathing passes t = seconds elapsed.
 */
export function computeField(fb: FieldBuffers, pr: Params, t: number): void {
  const f = fb.field;
  f.fill(0);
  for (let s = 0; s < pr.src.length; s++) {
    const sc = pr.src[s];
    const ph = sc.phi + (t ? sc.wa * Math.sin(t * sc.w) : 0);
    const K = fb.kd[s], A = fb.am[s];
    for (let p = 0; p < fb.N; p++) f[p] += A[p] * Math.sin(K[p] - ph);
  }
}
