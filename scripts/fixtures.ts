// Regenerates the committed test fixtures. Run ONLY when you intend to change
// them (which, per SPEC.md, should never happen for the frozen math):
//   npm run test:fixtures

import { writeFile } from 'node:fs/promises';
import { caseKey, paramsSnapshot, pixelHash, PARAM_NAMES, PIXEL_CASES } from '../test/helpers/snapshot.ts';

const params = Object.fromEntries(PARAM_NAMES.map((n) => [n, paramsSnapshot(n)]));
const pixels = {
  engine: `node ${process.versions.node} / v8 ${process.versions.v8}`,
  algorithm: 'sha256',
  note: 'sha256 of the RGBA bytes handed to putImageData. Identical on the same JS engine; other engines may differ in the last float bits.',
  cases: Object.fromEntries(PIXEL_CASES.map((c) => [caseKey(c), {
    name: c.name, size: c.size, t: c.t,
    hashes: Object.fromEntries(c.styles.map((s) => [s, pixelHash(c.name, c.size, s, c.t)])),
  }])),
};

const dir = new URL('../test/fixtures/', import.meta.url);
await writeFile(new URL('params.json', dir), JSON.stringify(params, null, 2) + '\n');
await writeFile(new URL('pixels.json', dir), JSON.stringify(pixels, null, 2) + '\n');
console.log('wrote test/fixtures/params.json and test/fixtures/pixels.json');
