// Acceptance #4 (API contract) against the fake browser in helpers/fake-dom.ts.
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { wavemark } from '../src/index.ts';
import { renderPixels } from '../src/render.ts';
import type { WavemarkOptions } from '../src/types.ts';
import { asCanvas, installFakeDom, type FakeDom, type FakeDomOptions } from './helpers/fake-dom.ts';
import { sameBytes } from './helpers/snapshot.ts';

let dom: FakeDom;

/** Swap the fake DOM for one with different options (e.g. reduced motion). */
function reinstall(opts?: FakeDomOptions): FakeDom {
  dom.uninstall();
  dom = installFakeDom(opts);
  return dom;
}

beforeEach(() => { dom = installFakeDom(); });
afterEach(() => { dom.uninstall(); });

describe('wavemark(name, canvas, options)', () => {
  it('default style is nodal', () => {
    const c = dom.createCanvas(64);
    wavemark('ankit', asCanvas(c));
    assert.strictEqual(c.puts, 1, 'exactly one static frame is painted');
    assert.ok(sameBytes(c.lastPut, renderPixels('ankit', 64, { style: 'nodal' })), 'bytes differ from nodal');
    assert.ok(!sameBytes(c.lastPut, renderPixels('ankit', 64, { style: 'pen' })), 'bytes equal pen');
    assert.ok(!sameBytes(c.lastPut, renderPixels('ankit', 64, { style: 'halo' })), 'bytes equal halo');
  });

  for (const style of ['nodal', 'pen', 'halo'] as const) {
    it(`style '${style}' paints exactly renderPixels(name, S, {style})`, () => {
      const c = dom.createCanvas(48);
      wavemark('grace', asCanvas(c), { style });
      assert.strictEqual(c.puts, 1);
      assert.ok(sameBytes(c.lastPut, renderPixels('grace', 48, { style })));
    });
  }

  it('uses min(width, height) as the backing size', () => {
    const wide = dom.createCanvas(0);
    wide.width = 48; wide.height = 32;
    wavemark('ada', asCanvas(wide));
    assert.strictEqual(wide.lastPut?.length, 32 * 32 * 4);
    assert.ok(sameBytes(wide.lastPut, renderPixels('ada', 32)));
    const tall = dom.createCanvas(0);
    tall.width = 32; tall.height = 48;
    wavemark('ada', asCanvas(tall));
    assert.strictEqual(tall.lastPut?.length, 32 * 32 * 4);
  });

  it('passes the palette override through', () => {
    const palette: WavemarkOptions['palette'] = [[0, 0, 0], [128, 128, 128], [255, 255, 255]];
    const c = dom.createCanvas(32);
    wavemark('ankit', asCanvas(c), { palette });
    assert.ok(sameBytes(c.lastPut, renderPixels('ankit', 32, { palette })));
    assert.ok(!sameBytes(c.lastPut, renderPixels('ankit', 32)));
  });

  it("empty, whitespace-only, null and undefined names render 'anonymous'", () => {
    const expected = renderPixels('anonymous', 32);
    for (const name of ['', '   ', '\n\t', null, undefined]) {
      const c = dom.createCanvas(32);
      wavemark(name as unknown as string, asCanvas(c));
      assert.ok(sameBytes(c.lastPut, expected), `name ${JSON.stringify(name)}`);
    }
  });

  it('treats options: null like no options', () => {
    const c = dom.createCanvas(32);
    const h = wavemark('ankit', asCanvas(c), null as unknown as WavemarkOptions);
    assert.ok(sameBytes(c.lastPut, renderPixels('ankit', 32, { style: 'nodal' })));
    assert.strictEqual(typeof h.stop, 'function');
  });

  it('rejects an unknown style with a RangeError before painting anything', () => {
    const c = dom.createCanvas(32);
    assert.throws(() => wavemark('ankit', asCanvas(c), { style: 'sketch' as never }), RangeError);
    assert.strictEqual(c.puts, 0);
    assert.throws(() => wavemark('ankit', asCanvas(dom.createCanvas(0)), { style: 'sketch' as never }), RangeError);
  });

  it('throws a clear Error when the canvas has no 2d context', () => {
    const c = dom.createCanvas(32);
    c.getContext = () => null;
    assert.throws(() => wavemark('ankit', asCanvas(c)), /getContext/);
  });

  it('returns a handle with exactly stop() and nothing else', () => {
    const h = wavemark('ankit', asCanvas(dom.createCanvas(16)));
    assert.deepStrictEqual(Object.keys(h), ['stop']);
    assert.strictEqual(typeof h.stop, 'function');
  });

  it('a 0x0 canvas returns a handle without painting or throwing', () => {
    const c = dom.createCanvas(0);
    const h = wavemark('ankit', asCanvas(c), { breathe: true });
    assert.strictEqual(c.puts, 0);
    assert.strictEqual(dom.pending(), 0);
    assert.doesNotThrow(() => h.stop());
  });
});

describe('breathe / stop()', () => {
  it('breathe: false paints once, queues no frames, and stop() is a no-op', () => {
    const c = dom.createCanvas(32);
    const h = wavemark('ankit', asCanvas(c));
    assert.strictEqual(dom.pending(), 0);
    h.stop();
    dom.flush(16);
    assert.strictEqual(c.puts, 1);
  });

  it('breathe: true paints every other animation frame (~30 fps) with elapsed seconds', () => {
    const c = dom.createCanvas(32);
    wavemark('ankit', asCanvas(c), { breathe: true });
    assert.strictEqual(c.puts, 1, 'static frame first');
    assert.strictEqual(dom.pending(), 1, 'one frame queued');
    dom.flush(1000);   // frame 0: paints (t = 0, identical to static)
    dom.flush(1016);   // frame 1: skipped
    dom.flush(1033);   // frame 2: paints (t = 0.033)
    dom.flush(1050);   // frame 3: skipped
    assert.strictEqual(c.puts, 3, 'two extra paints over four frames');
    assert.strictEqual(dom.pending(), 1, 'still exactly one frame queued');
    dom.flush(2500);   // frame 4: paints at t = 1.5 s
    assert.ok(sameBytes(c.lastPut, renderPixels('ankit', 32, { style: 'nodal' }, 1.5)));
  });

  it('the first breathing frame is the static identity (t starts at 0)', () => {
    const c = dom.createCanvas(32);
    wavemark('ankit', asCanvas(c), { breathe: true });
    dom.flush(123456);
    assert.ok(sameBytes(c.lastPut, renderPixels('ankit', 32)));
  });

  it('stop() halts the loop and is idempotent', () => {
    const c = dom.createCanvas(32);
    const h = wavemark('ankit', asCanvas(c), { breathe: true });
    dom.flush(0); dom.flush(16); dom.flush(33);
    const paints = c.puts;
    h.stop();
    assert.strictEqual(dom.pending(), 0);
    dom.flush(50); dom.flush(66);
    assert.strictEqual(c.puts, paints, 'no paints after stop');
    assert.doesNotThrow(() => h.stop());
    assert.strictEqual(dom.pending(), 0);
  });

  it('calling wavemark again on the same canvas stops the previous loop', () => {
    const c = dom.createCanvas(32);
    const first = wavemark('ankit', asCanvas(c), { breathe: true });
    assert.strictEqual(dom.pending(), 1);
    wavemark('grace', asCanvas(c), { breathe: true });
    assert.strictEqual(dom.pending(), 1, 'old loop cancelled, new one queued');
    const paints = c.puts;
    first.stop(); // stale handle must not kill the new loop
    assert.strictEqual(dom.pending(), 1);
    dom.flush(0);
    assert.strictEqual(c.puts, paints + 1);
    assert.ok(sameBytes(c.lastPut, renderPixels('grace', 32)));
  });

  it('a rejected call on a breathing canvas leaves the loop running', () => {
    const c = dom.createCanvas(32);
    wavemark('ankit', asCanvas(c), { breathe: true });
    assert.throws(() => wavemark('ankit', asCanvas(c), { style: 'sketch' as never }), RangeError);
    assert.strictEqual(dom.pending(), 1);
    const paints = c.puts;
    dom.flush(100);
    assert.strictEqual(c.puts, paints + 1);
  });

  it('renders a static frame under prefers-reduced-motion: reduce', () => {
    reinstall({ reduceMotion: true });
    const c = dom.createCanvas(32);
    const h = wavemark('ankit', asCanvas(c), { breathe: true });
    assert.strictEqual(c.puts, 1);
    assert.strictEqual(dom.pending(), 0);
    assert.doesNotThrow(() => h.stop());
    assert.ok(sameBytes(c.lastPut, renderPixels('ankit', 32)));
  });

  it('falls back to a static frame when requestAnimationFrame is unavailable', () => {
    const saved = globalThis.requestAnimationFrame;
    // @ts-expect-error simulating a non-browser host with a canvas polyfill
    delete globalThis.requestAnimationFrame;
    try {
      const c = dom.createCanvas(32);
      const h = wavemark('ankit', asCanvas(c), { breathe: true });
      assert.strictEqual(c.puts, 1);
      assert.doesNotThrow(() => h.stop());
    } finally {
      globalThis.requestAnimationFrame = saved;
    }
  });
});

describe('wavemark.toDataURL(name, size, options)', () => {
  it("returns a string starting with 'data:image/png'", () => {
    assert.ok(wavemark.toDataURL('ankit').startsWith('data:image/png'));
  });

  it('renders at 2x the CSS size, default 64', () => {
    wavemark.toDataURL('ankit');
    assert.deepStrictEqual([dom.canvases.at(-1)!.width, dom.canvases.at(-1)!.height], [128, 128]);
    wavemark.toDataURL('ankit', 20);
    assert.deepStrictEqual([dom.canvases.at(-1)!.width, dom.canvases.at(-1)!.height], [40, 40]);
  });

  it('passes style and palette through and never animates', () => {
    const palette: WavemarkOptions['palette'] = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
    wavemark.toDataURL('ankit', 32, { style: 'halo', palette, breathe: true });
    const c = dom.canvases.at(-1)!;
    assert.ok(sameBytes(c.lastPut, renderPixels('ankit', 64, { style: 'halo', palette })));
    assert.strictEqual(dom.pending(), 0);
  });

  it("empty name renders 'anonymous'", () => {
    assert.strictEqual(wavemark.toDataURL('', 16), wavemark.toDataURL('anonymous', 16));
  });

  it('treats options: null like no options', () => {
    assert.ok(wavemark.toDataURL('ankit', 16, null as unknown as WavemarkOptions).startsWith('data:image/png'));
  });

  it('rejects a non-positive or non-finite size with a RangeError', () => {
    for (const size of [0, -1, NaN, Infinity, -Infinity, '64' as unknown as number]) {
      assert.throws(() => wavemark.toDataURL('ankit', size), RangeError, `size ${size}`);
    }
  });

  it('throws a clear Error when document is unavailable', () => {
    dom.uninstall();
    try {
      assert.throws(() => wavemark.toDataURL('ankit'), (e: unknown) => e instanceof Error && /document|browser/.test(e.message));
    } finally {
      dom = installFakeDom();
    }
  });
});
