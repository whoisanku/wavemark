// Acceptance #5 (zero dependencies) and package hygiene. See SPEC.md.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

interface PackageJson {
  name: string;
  version: string;
  license: string;
  type?: string;
  sideEffects?: boolean;
  main?: string;
  types?: string;
  exports: Record<string, Record<string, string> | string>;
  files: string[];
  keywords: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts: Record<string, string>;
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as PackageJson;

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
  );

describe('zero dependencies (acceptance #5)', () => {
  it('package.json has no runtime dependencies', () => {
    assert.ok(!pkg.dependencies || Object.keys(pkg.dependencies).length === 0, 'dependencies must be absent or empty');
  });

  it('src/ only imports its own relative modules', () => {
    for (const file of walk(join(root, 'src'))) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/^\s*(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]/gm)) {
        assert.ok(m[1]!.startsWith('./') || m[1]!.startsWith('../'), `${file}: bare import '${m[1]}'`);
      }
    }
  });
});

describe('package.json hygiene', () => {
  it('has the SPEC.md identity', () => {
    assert.strictEqual(pkg.name, 'wavemark');
    assert.strictEqual(pkg.version, '0.1.0');
    assert.strictEqual(pkg.license, 'MIT');
    assert.strictEqual(pkg.type, 'module');
    assert.strictEqual(pkg.sideEffects, false);
  });

  it('has the SPEC.md keywords', () => {
    for (const k of ['avatar', 'identicon', 'generative-art', 'wave-interference', 'canvas', 'zero-dependency']) {
      assert.ok(pkg.keywords.includes(k), `missing keyword ${k}`);
    }
  });

  it('exports ESM + types from dist/ and whitelists only dist/', () => {
    const root = pkg.exports['.'] as Record<string, string>;
    assert.ok(root.types?.startsWith('./dist/'), 'exports["."].types');
    assert.ok(root.import?.startsWith('./dist/') && root.import.endsWith('.js'), 'exports["."].import');
    assert.ok(root.default?.startsWith('./dist/'), 'exports["."].default');
    assert.ok(pkg.main?.startsWith('./dist/') && pkg.types?.startsWith('./dist/'));
    assert.deepStrictEqual(pkg.files, ['dist/']);
  });

  it('never publishes or releases on its own', () => {
    for (const [name, cmd] of Object.entries(pkg.scripts)) {
      assert.ok(!/npm publish|git push|git tag|release/.test(cmd), `script '${name}' must not publish`);
    }
    assert.strictEqual(pkg.scripts['prepack'], 'npm run build', 'a manual npm publish must build first');
  });
});
