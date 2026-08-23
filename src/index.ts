// wavemark — public entry point. See SPEC.md for the API contract.

import { createRenderer, normalizeName, normalizeStyle } from './render.ts';
import type { WavemarkHandle, WavemarkOptions } from './types.ts';

export type { RGB, WavemarkHandle, WavemarkOptions, WavemarkStyle } from './types.ts';

/** Handles keyed by canvas, so re-rendering a canvas stops its old loop first. */
const active = new WeakMap<HTMLCanvasElement, WavemarkHandle>();

const noop = (): void => {};

/**
 * Draws the avatar into the given canvas at its current backing resolution
 * (canvas.width × canvas.height; use a square canvas — a non-square canvas
 * gets a min(width, height) square drawn at the top-left). The caller controls
 * display size via CSS. Calling wavemark again on the same canvas stops any
 * previous animation on it first.
 */
export function wavemark(name: string, canvas: HTMLCanvasElement, options?: WavemarkOptions): WavemarkHandle {
  const opts = options ?? {};
  // Validate before touching the canvas, so a bad call can't kill a running loop.
  const style = normalizeStyle(opts.style);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('wavemark: canvas.getContext("2d") returned null');

  active.get(canvas)?.stop();

  const S = Math.min(canvas.width, canvas.height) | 0;
  const handle: WavemarkHandle = { stop: noop };
  if (S <= 0) return handle;

  const img = ctx.createImageData(S, S);
  const renderer = createRenderer(normalizeName(name), S, { style, palette: opts.palette }, img.data);
  const draw = (t: number): void => { renderer.frame(t); ctx.putImageData(img, 0, 0); };
  draw(0);

  if (!opts.breathe || typeof requestAnimationFrame !== 'function') return handle;
  // Honour the OS "reduce motion" setting: render the static frame only.
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)')?.matches) return handle;

  // Breathe: ~30 fps by rendering every other animation frame.
  let raf = 0, n = 0, t0 = -1;
  const tick = (now: number): void => {
    raf = requestAnimationFrame(tick);
    if (n++ & 1) return;
    if (t0 < 0) t0 = now;
    draw((now - t0) / 1000);
  };
  raf = requestAnimationFrame(tick);
  handle.stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    handle.stop = noop;
    if (active.get(canvas) === handle) active.delete(canvas);
  };
  active.set(canvas, handle);
  return handle;
}

/**
 * Renders offscreen and returns a PNG data URL. `size` is the CSS pixel size;
 * rendered internally at 2× for sharpness. Default size: 64. Browser only —
 * throws a clear Error if `document` is unavailable.
 */
wavemark.toDataURL = function toDataURL(name: string, size = 64, options?: WavemarkOptions): string {
  if (typeof document === 'undefined') {
    throw new Error('wavemark.toDataURL is browser-only: `document` is not available in this environment');
  }
  if (!(size > 0) || !Number.isFinite(size)) {
    throw new RangeError(`wavemark.toDataURL: size must be a positive number, got ${size}`);
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.max(1, Math.round(size * 2));
  wavemark(name, canvas, { style: options?.style, palette: options?.palette });
  return canvas.toDataURL('image/png');
};
