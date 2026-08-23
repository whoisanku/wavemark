// Acceptance #2 (pixel determinism) plus headless renderer sanity. See SPEC.md.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderPixels, STYLES } from '../src/render.ts';
import type { WavemarkOptions } from '../src/types.ts';
import { caseKey, pixelHash, sameBytes, PIXEL_CASES, PIXEL_NAME, PIXEL_SIZE } from './helpers/snapshot.ts';

interface PixelFixture {
  engine: string;
  algorithm: string;
  cases: Record<string, { name: string; size: number; t: number; hashes: Record<string, string> }>;
}

const fixture = JSON.parse(readFileSync(new URL('./fixtures/pixels.json', import.meta.url), 'utf8')) as PixelFixture;

describe('pixel determinism (acceptance #2)', () => {
  it('fixture covers exactly the snapshot helper cases, led by (ankit, 128px)', () => {
    assert.strictEqual(fixture.algorithm, 'sha256');
    assert.deepStrictEqual(Object.keys(fixture.cases), PIXEL_CASES.map(caseKey));
    assert.strictEqual(PIXEL_CASES[0]!.name, PIXEL_NAME);
    assert.strictEqual(PIXEL_CASES[0]!.size, PIXEL_SIZE);
    assert.deepStrictEqual([...PIXEL_CASES[0]!.styles].sort(), [...STYLES].sort());
    for (const c of PIXEL_CASES) {
      const f = fixture.cases[caseKey(c)]!;
      assert.deepStrictEqual({ name: f.name, size: f.size, t: f.t }, { name: c.name, size: c.size, t: c.t });
      assert.deepStrictEqual(Object.keys(f.hashes).sort(), [...c.styles].sort());
    }
  });

  for (const c of PIXEL_CASES) {
    for (const style of c.styles) {
      const label = `(${c.name}, ${c.size}px, ${style}${c.t ? `, t=${c.t}s` : ''})`;
      it(`sha256 of ${label} matches the committed fixture`, () => {
        assert.strictEqual(
          pixelHash(c.name, c.size, style, c.t),
          fixture.cases[caseKey(c)]!.hashes[style],
          `pixel hash for ${label} differs from test/fixtures/pixels.json. ` +
            `The fixture was recorded on engine "${fixture.engine}" (now running node ${process.versions.node} / ` +
            `v8 ${process.versions.v8}). Cross-engine floating point may differ in the last bits, so determinism ` +
            'is only guaranteed per engine; on the SAME engine this means the frozen math in src/core changed.',
        );
      });
    }
  }

  it('is deterministic across calls', () => {
    for (const style of STYLES) {
      assert.strictEqual(pixelHash(PIXEL_NAME, PIXEL_SIZE, style), pixelHash(PIXEL_NAME, PIXEL_SIZE, style));
    }
  });
});

describe('renderPixels', () => {
  const S = 64;

  it('returns an RGBA buffer of length S*S*4', () => {
    for (const size of [1, 2, 16, 64, 128]) {
      const px = renderPixels('ankit', size);
      assert.ok(px instanceof Uint8ClampedArray);
      assert.strictEqual(px.length, size * size * 4);
    }
  });

  it('alpha is 0 at the corner and 255 at the center', () => {
    for (const style of STYLES) {
      const px = renderPixels('ankit', S, { style });
      assert.strictEqual(px[3], 0, `${style}: corner alpha`);
      assert.strictEqual(px[((S / 2) * S + S / 2) * 4 + 3], 255, `${style}: center alpha`);
    }
  });

  it('pixels outside the disk are transparent, inside opaque, with a soft rim between', () => {
    const px = renderPixels('grace', S);
    const R = S / 2, cx = (S - 1) / 2;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const rr = Math.hypot((x - cx) / R, (y - cx) / R);
      const a = px[(y * S + x) * 4 + 3]!;
      if (rr > 1) assert.strictEqual(a, 0, `(${x},${y}) rr=${rr}`);
      else if (rr <= 0.985) assert.strictEqual(a, 255, `(${x},${y}) rr=${rr}`);
      else assert.ok(a > 0 && a < 255, `(${x},${y}) soft rim alpha ${a} should be strictly between 0 and 255`);
    }
  });

  it('the three styles produce three distinct buffers', () => {
    const out = STYLES.map((style) => renderPixels('ankit', S, { style }));
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        assert.ok(!sameBytes(out[i]!, out[j]!), `${STYLES[i]} and ${STYLES[j]} rendered identical bytes`);
      }
    }
  });

  it('breathe time t moves the pattern (t=1.5 differs from t=0)', () => {
    for (const style of STYLES) {
      assert.ok(!sameBytes(renderPixels('ankit', S, { style }, 0), renderPixels('ankit', S, { style }, 1.5)), style);
    }
  });

  it('omitting t is the same as t=0', () => {
    assert.ok(sameBytes(renderPixels('ankit', S), renderPixels('ankit', S, {}, 0)));
  });

  it('a palette override changes the output, deterministically', () => {
    const palette: WavemarkOptions['palette'] = [[0, 0, 0], [128, 128, 128], [255, 255, 255]];
    const dflt = renderPixels('ankit', S);
    const over = renderPixels('ankit', S, { palette });
    assert.ok(!sameBytes(dflt, over), 'palette override rendered the same bytes as the default');
    assert.ok(sameBytes(over, renderPixels('ankit', S, { palette })));
  });

  it("empty and whitespace-only names render as 'anonymous'", () => {
    assert.ok(sameBytes(renderPixels('', 32), renderPixels('anonymous', 32)));
    assert.ok(sameBytes(renderPixels('  ', 32), renderPixels('anonymous', 32)));
  });

  it('non-blank names are hashed as given (no trimming)', () => {
    assert.ok(!sameBytes(renderPixels(' ankit', 32), renderPixels('ankit', 32)));
    assert.ok(!sameBytes(renderPixels('ankit ', 32), renderPixels('ankit', 32)));
  });

  it('different names render different avatars', () => {
    assert.ok(!sameBytes(renderPixels('ankit', S), renderPixels('ankita', S)));
  });

  it('rejects unknown styles with a RangeError', () => {
    assert.throws(() => renderPixels('ankit', S, { style: 'sketch' as never }), RangeError);
  });
});
