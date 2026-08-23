// Renderer glue (not part of the frozen reference). Ties makeParams ->
// buildField -> computeField -> paint together for one (name, size, options)
// triple. Headless: it knows nothing about canvases.

import { makeParams } from './core/params.ts';
import { buildField, computeField } from './core/field.ts';
import { paint, type PaintState } from './core/paint.ts';
import { deriveColors } from './core/palettes.ts';
import type { WavemarkOptions, WavemarkStyle } from './types.ts';

export const STYLES: readonly WavemarkStyle[] = ['nodal', 'pen', 'halo'];

/**
 * Empty or whitespace-only names fall back to 'anonymous'. Non-blank names are
 * hashed exactly as given (no trimming) so that "same string in, same avatar
 * out" holds literally.
 */
export function normalizeName(name: unknown): string {
  const s = name ? String(name) : '';
  return s.trim() ? s : 'anonymous';
}

export function normalizeStyle(style: unknown): WavemarkStyle {
  if (style === undefined) return 'nodal';
  if (STYLES.includes(style as WavemarkStyle)) return style as WavemarkStyle;
  throw new RangeError(`wavemark: unknown style ${JSON.stringify(style)}; expected 'nodal' | 'pen' | 'halo'`);
}

export interface Renderer {
  /** Paint the field at time t seconds (0 = static) and return the RGBA pixels (S*S*4). */
  frame(t: number): Uint8ClampedArray;
}

/**
 * Create a renderer bound to an output buffer. The field precomputation
 * (k·distance, amplitude, mask) happens once here and is reused by every
 * `frame(t)` call, which is what makes breathing cheap.
 *
 * @param name    already normalized (see normalizeName)
 * @param S       backing size in pixels (square)
 * @param data    output buffer; allocated if omitted
 */
export function createRenderer(
  name: string,
  S: number,
  options: WavemarkOptions = {},
  data?: Uint8ClampedArray,
): Renderer {
  const style = normalizeStyle(options.style);
  const params = makeParams(name);
  const fb = buildField(params, S);
  const out = data ?? new Uint8ClampedArray(fb.N * 4);
  const colors = deriveColors(options.palette ?? params.pal);
  const st: PaintState = { ...colors, data: out, field: fb.field, mask: fb.mask, g: params.g, S, N: fb.N };
  return {
    frame(t) {
      computeField(fb, params, t);
      paint(st, style);
      return out;
    },
  };
}

/**
 * One-shot headless render: RGBA pixels for (name, S, options) at time t.
 * This is byte-for-byte what `wavemark()` hands to `putImageData`.
 */
export function renderPixels(name: string, S: number, options?: WavemarkOptions, t = 0): Uint8ClampedArray {
  return createRenderer(normalizeName(name), S, options).frame(t);
}
