// Acceptance #1 (params determinism) and #3 (avalanche sanity). See SPEC.md.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeParams } from '../src/core/params.ts';
import { cyrb128 } from '../src/core/hash.ts';
import { PALETTES, ramp, type Palette } from '../src/core/palettes.ts';
import { paramsSnapshot, PARAM_NAMES, type ParamsSnapshot } from './helpers/snapshot.ts';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/params.json', import.meta.url), 'utf8'),
) as Record<string, ParamsSnapshot>;

describe('params determinism (acceptance #1)', () => {
  it('fixture covers exactly the snapshot names', () => {
    assert.deepStrictEqual(Object.keys(fixture), [...PARAM_NAMES]);
  });

  for (const name of PARAM_NAMES) {
    it(`makeParams('${name}') matches the committed snapshot`, () => {
      assert.deepStrictEqual(
        JSON.parse(JSON.stringify(paramsSnapshot(name))),
        fixture[name],
        `snapshot for '${name}' differs from test/fixtures/params.json — the frozen math in src/core changed`,
      );
    });
  }

  it('is deterministic across calls', () => {
    for (const name of PARAM_NAMES) assert.deepStrictEqual(makeParams(name), makeParams(name));
  });

  it('derives 3 to 5 sources, a palette from the table, and g = 1.6 / sqrt(n)', () => {
    for (const name of ['a', 'b', 'c', 'ankit', 'hello@example.com', 'user_4821', 'anonymous', '']) {
      const pr = makeParams(name);
      assert.ok(pr.src.length >= 3 && pr.src.length <= 5, `${name}: ${pr.src.length} sources`);
      assert.ok(PALETTES.includes(pr.pal), `${name}: palette not from PALETTES`);
      assert.strictEqual(pr.g, 1.6 / Math.sqrt(pr.src.length));
    }
  });

  it("empty string hashes as 'anonymous'", () => {
    assert.deepStrictEqual(makeParams(''), makeParams('anonymous'));
  });
});

describe('avalanche sanity (acceptance #3)', () => {
  it("'ankit' and 'ankita' yield different seeds", () => {
    assert.notStrictEqual(cyrb128('ankit'), cyrb128('ankita'));
  });

  it("'ankit' and 'ankita' yield different source sets", () => {
    assert.notDeepStrictEqual(makeParams('ankit').src, makeParams('ankita').src);
  });

  it('seeds are unsigned 32-bit integers', () => {
    for (const name of ['', 'a', 'ankit', 'ankita', 'anonymous']) {
      const h = cyrb128(name);
      assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xffffffff, `${JSON.stringify(name)} -> ${h}`);
    }
  });
});

describe('palette literals (frozen in SPEC.md)', () => {
  // Inline copy of the SPEC.md PALETTES block. The params fixture only stores
  // the palette INDEX, so without this the values of palettes that no fixture
  // name happens to use would be unprotected.
  const SPEC_PALETTES = [
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

  it('PALETTES match the SPEC.md literal, value for value and in order', () => {
    assert.deepStrictEqual(JSON.parse(JSON.stringify(PALETTES)), SPEC_PALETTES);
  });

  it('ramp() is the 3-stop linear ramp from SPEC.md', () => {
    const pal = SPEC_PALETTES[0] as Palette;
    assert.deepStrictEqual(ramp(pal, 0), [30, 27, 75]);
    assert.deepStrictEqual(ramp(pal, 0.5), [99, 102, 241]);
    assert.deepStrictEqual(ramp(pal, 1), [224, 231, 255]);
    // derived colors used by paint: t = 0.10, 0.20 (first segment), 0.95 (second segment)
    assert.deepStrictEqual(ramp(pal, 0.10), [30 + 69 * 0.2, 27 + 75 * 0.2, 75 + 166 * 0.2]);
    assert.deepStrictEqual(ramp(pal, 0.20), [30 + 69 * 0.4, 27 + 75 * 0.4, 75 + 166 * 0.4]);
    const u = (0.95 - 0.5) * 2; // 0.8999999999999999 in IEEE-754, same as the ramp
    assert.deepStrictEqual(ramp(pal, 0.95), [99 + 125 * u, 102 + 129 * u, 241 + 14 * u]);
    // clamped outside [0, 1]
    assert.deepStrictEqual(ramp(pal, -3), ramp(pal, 0));
    assert.deepStrictEqual(ramp(pal, 7), ramp(pal, 1));
  });
});
