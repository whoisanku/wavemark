// ---------- paint: three styles ----------
// FROZEN (SPEC.md): do not change any constant or formula in this file.
// v = raw field value; tt = 0.5 + 0.5 * tanh(v * g) maps it to [0, 1].
// All styles share: base color = tt < 0.5 ? ramp(pal, 0.10) : ramp(pal, 0.20)
// (faint two-tone shading by sign), line/accent color = ramp(pal, 0.95),
// final pixel = lerp(base, accent, intensity), alpha = mask * 255.
//
// Structural adaptation from the reference: `paint` writes into `st.data`
// (an ImageData's `.data` or any RGBA Uint8ClampedArray) and the caller does
// `ctx.putImageData`. This lets the exact same pixel pipeline run headless.

import type { WavemarkStyle } from '../types.ts';
import type { Colors } from './palettes.ts';

export interface PaintState extends Colors {
  /** RGBA output, length S*S*4 */
  data: Uint8ClampedArray;
  field: Float32Array;
  mask: Float32Array;
  g: number;
  S: number;
  N: number;
}

export function paint(st: PaintState, mode: WavemarkStyle): void {
  const d = st.data, f = st.field, mk = st.mask, g = st.g, S = st.S, N = st.N;
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
}
