import * as fs from 'fs';
import * as path from 'path';
import { EXPLORER_ASSET_PURPOSES } from '../../../../types/explorerGrowth';

/**
 * EPIC 5 T001 — the seam that could not be seen.
 *
 * The Governor asked for `weekly_digest`. The registry could only ever hold
 * `LESSON`. Two vocabularies with zero members in common, meeting at a field
 * typed `string`, so the compiler could not object, the `VARCHAR(32)` column
 * could not object, and no test on either side could fail. Four EPICs shipped
 * over it.
 *
 * These tests exist so the next person to touch either list finds out
 * immediately rather than in a shadow report that reads like a content gap.
 */

/**
 * The kinds, read out of the source rather than re-typed here.
 *
 * Re-typing them would be the bug again in miniature: a hand-copied list drifts
 * from the real union silently, and a drifted copy would still pass every
 * assertion below while proving nothing about the actual type.
 */
function assetKindsFromSource(): string[] {
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', '..', 'types', 'explorerGrowth.ts'),
    'utf8',
  );
  const decl = src.match(/export type ExplorerAssetType =([\s\S]*?);/);
  if (!decl) throw new Error('ExplorerAssetType not found — this test is checking nothing');
  return Array.from(decl[1].matchAll(/'([^']+)'/g)).map((m) => m[1]);
}

describe('purposes and kinds are separate vocabularies', () => {
  const kinds = assetKindsFromSource();

  it('found the real union (a test over an empty list proves nothing)', () => {
    expect(kinds.length).toBeGreaterThan(10);
    expect(kinds).toContain('LESSON');
  });

  it('shares NOT ONE member with the purposes — the whole bug in one line', () => {
    const overlap = EXPLORER_ASSET_PURPOSES.filter((p) => kinds.includes(p));
    expect(overlap).toEqual([]);
  });

  it('keeps the two shapes distinguishable by eye as well as by type', () => {
    // Kinds SHOUT, purposes whisper. Not decoration: a reviewer scanning a diff
    // can tell which vocabulary a literal belongs to without opening the type.
    for (const k of kinds) expect(k).toBe(k.toUpperCase());
    for (const p of EXPLORER_ASSET_PURPOSES) expect(p).toBe(p.toLowerCase());
  });
});

describe('the purpose list matches what the Governor actually asks for', () => {
  const CANDIDATES_DIR = path.join(__dirname, '..', '..', 'governor', 'candidates');

  /** Every `asset_type: '...'` literal the five generators emit. */
  function purposesEmittedBySource(): string[] {
    const out = new Set<string>();
    for (const f of fs.readdirSync(CANDIDATES_DIR)) {
      if (!f.endsWith('.ts')) continue;
      const src = fs.readFileSync(path.join(CANDIDATES_DIR, f), 'utf8');
      for (const m of src.matchAll(/asset_type:\s*(?:[^'"]*\?\s*)?'([^']+)'(?:\s*:\s*'([^']+)')?/g)) {
        if (m[1]) out.add(m[1]);
        if (m[2]) out.add(m[2]);
      }
    }
    return [...out];
  }

  const emitted = purposesEmittedBySource();

  it('found literals to check', () => {
    expect(emitted.length).toBeGreaterThan(0);
  });

  it('declares every purpose the generators emit', () => {
    // A generator asking for something undeclared is now a compile error, but
    // only if this list is complete. This is what keeps it complete.
    const undeclared = emitted.filter(
      (p) => !(EXPLORER_ASSET_PURPOSES as readonly string[]).includes(p),
    );
    expect(undeclared).toEqual([]);
  });

  it('picks up the ternary in activationRescue, not just the plain literals', () => {
    // `neverEngaged ? 'activation_first_step' : 'activation_restart'` — a naive
    // scan catches one arm and silently misses the other.
    expect(emitted).toEqual(expect.arrayContaining(['activation_first_step', 'activation_restart']));
  });
});

describe('the const array is the source, and the union follows it', () => {
  it('is enumerable at runtime — which a bare union would not be', () => {
    // assetPurposeMap's exhaustiveness walk needs something to iterate. This is it.
    expect([...EXPLORER_ASSET_PURPOSES]).toHaveLength(8);
    expect(new Set(EXPLORER_ASSET_PURPOSES).size).toBe(8);
  });

  it('keeps its type-level guard somewhere the compiler actually reads', () => {
    // THESE ASSERTIONS USED TO LIVE HERE, AND WERE READ BY NOTHING.
    // `tsconfig.json` excludes `**/__tests__/**`, so `tsc --noEmit` never
    // compiles this file — `--listFiles` reports zero .test.ts among 4,661.
    // ts-jest runs `isolatedModules`, i.e. transpile-only, so a blatant type
    // error passes green here too. Two tests named as type checks asserted only
    // that a string equalled itself, and reverting the narrowing to `string`
    // would have left every gate green.
    //
    // They now live in `assetVocabulary.typecheck.ts`, a plain source file that
    // `include: ["src/**/*"]` matches. This test exists so that deleting that
    // file is a visible failure rather than a silent loss of the guard.
    const guard = path.join(__dirname, '..', 'assetVocabulary.typecheck.ts');
    expect(fs.existsSync(guard)).toBe(true);
    const src = fs.readFileSync(guard, 'utf8');
    expect(src).toContain('@ts-expect-error');
    expect((src.match(/@ts-expect-error/g) || []).length).toBeGreaterThanOrEqual(3);
  });
});
