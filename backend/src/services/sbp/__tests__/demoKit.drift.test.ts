/**
 * The single-source-of-truth guard for the demo kit.
 *
 * `demoKit.ts` ships bytes from `demoKitAssets.generated.ts` because `tsc` does not copy non-TS
 * files into `dist/`. That creates exactly the hazard this repo warns about: two copies of the
 * same content, one readable and one shipped, free to drift. These tests bind them.
 *
 * Tests read from SOURCE (not dist), so `demoKitAssets/` is present here even though it is absent
 * from the production image. That asymmetry is the whole reason the drift check belongs in CI.
 */
import fs from 'fs';
import path from 'path';
import { demoKitFiles } from '../demoKit';
import {
  DEMO_KIT_ENGINE_PATH,
  DEMO_KIT_SCAFFOLD_PATH,
  DEMO_KIT_STANDALONE_PATH,
  DEMO_KIT_CONTRACT_PATH,
  CONNECTED_DEMO_ENTRY_PATH,
  CONNECTED_DEMO_SPEC_PATH,
  CONNECTED_DEMO_STANDALONE_PATH,
} from '../connectedDemoStory';
import { isAllowedPath } from '../renderDocs';

const ASSET_DIR = path.resolve(__dirname, '../demoKitAssets');

/** Asset file on disk -> the kit path it is published at. */
const PAIRS: ReadonlyArray<[string, string]> = [
  ['index.html', DEMO_KIT_ENGINE_PATH],
  ['scaffold-demo-spec.mjs', DEMO_KIT_SCAFFOLD_PATH],
  ['build-standalone.mjs', DEMO_KIT_STANDALONE_PATH],
  ['DEMO_SPEC_CONTRACT.md', DEMO_KIT_CONTRACT_PATH],
];

describe('demoKit: one copy, enforced', () => {
  it('ships exactly four files', () => {
    expect(demoKitFiles()).toHaveLength(4);
  });

  it.each(PAIRS)('%s is byte-identical to the shipped constant', (file, kitPath) => {
    const onDisk = fs.readFileSync(path.join(ASSET_DIR, file), 'utf8');
    const shipped = demoKitFiles().find((f) => f.path === kitPath);
    expect(shipped).toBeDefined();
    // Byte equality, not a length or prefix check: a truncated engine would pass those.
    expect(shipped!.content).toBe(onDisk);
  });

  it('is deterministic: two calls produce identical paths AND contents in identical order', () => {
    const a = demoKitFiles();
    const b = demoKitFiles();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('no file is empty, which a failed generation would produce silently', () => {
    for (const f of demoKitFiles()) {
      expect(f.content.length).toBeGreaterThan(100);
    }
  });

  /**
   * The orphan check, and why it reads the DIRECTORY rather than the PAIRS list.
   *
   * Every other test here iterates the hardcoded PAIRS list, so it can only check files somebody
   * remembered to add to it. An independent verifier proved the gap by dropping a fifth file into
   * `demoKitAssets/`: all 15 tests still passed while that file was silently never shipped to any
   * repo. Reading the directory closes it, so adding an asset without wiring it fails here.
   */
  it('every file in demoKitAssets/ is actually shipped: no orphans', () => {
    const onDisk = fs.readdirSync(ASSET_DIR).sort();
    const shipped = demoKitFiles().map((f) => f.path.replace('docs/demo-kit/', '')).sort();
    expect(shipped).toEqual(onDisk);
  });
});

describe('demoKit: path policy, asserted in BOTH directions', () => {
  // Direction 1: what the PLATFORM writes must be allowed, or renderDocs throws.
  it.each(PAIRS.map(([, p]) => p))('platform-written path %s passes isAllowedPath', (kitPath) => {
    expect(isAllowedPath(kitPath)).toBe(true);
  });

  /**
   * Direction 2, and the one that actually catches a bug.
   *
   * `demo/**` is written by the BUILDER's own agent in their repo, never by the platform, exactly
   * as `index.html` is for STORY-000. It is deliberately OUTSIDE `PATH_ALLOWLIST`. If a future
   * change has the platform emit into `demo/`, renderDocs would reject it - and this test says so
   * at the point of the mistake rather than leaving someone to debug a RenderError.
   *
   * Asserting only direction 1 would be the one-way test this repo keeps rediscovering.
   */
  it.each([
    CONNECTED_DEMO_ENTRY_PATH,
    CONNECTED_DEMO_SPEC_PATH,
    CONNECTED_DEMO_STANDALONE_PATH,
  ])('builder-written path %s is NOT platform-writable', (demoPath) => {
    expect(isAllowedPath(demoPath)).toBe(false);
  });

  it('every kit file lives under docs/demo-kit/, which is why direction 1 holds', () => {
    for (const f of demoKitFiles()) {
      expect(f.path.startsWith('docs/demo-kit/')).toBe(true);
    }
  });
});
