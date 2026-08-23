// ---------- name -> wave sources ----------
// FROZEN (SPEC.md). rnd() CALL ORDER IS FROZEN: n, then per source (ang, rad,
// wl, phi, w, wa-magnitude, wa-sign), then palette index. Changing it changes
// every avatar.

import { cyrb128, mulberry32 } from './hash.ts';
import { PALETTES, type Palette } from './palettes.ts';

export interface Source {
  /** position, in R units */
  x: number;
  y: number;
  /** wavenumber */
  k: number;
  /** static phase */
  phi: number;
  /** breathe frequency (rad/s) */
  w: number;
  /** breathe amplitude, signed (rad) */
  wa: number;
}

export interface Params {
  src: Source[];
  pal: Palette;
  /** tone-mapping gain */
  g: number;
}

/** Hash a name into wave sources, a palette, and a tone-mapping gain. */
export function makeParams(name: string): Params {
  const rnd = mulberry32(cyrb128(name || 'anonymous'));
  const n = 3 + Math.floor(rnd() * 3);           // 3–5 sources
  const src: Source[] = [];
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
