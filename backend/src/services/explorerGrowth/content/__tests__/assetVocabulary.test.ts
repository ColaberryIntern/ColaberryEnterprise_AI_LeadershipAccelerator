import * as fs from 'fs';
import * as path from 'path';
import { EXPLORER_ASSET_PURPOSES } from '../../../../types/explorerGrowth';
import type { ExplorerAssetPurpose, ExplorerAssetType } from '../../../../types/explorerGrowth';

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

  it('types a purpose variable from the array, not the other way round', () => {
    const p: ExplorerAssetPurpose = 'weekly_digest';
    expect(EXPLORER_ASSET_PURPOSES).toContain(p);
    // @ts-expect-error a KIND is not a PURPOSE — this line failing to error
    // would mean the seam is untyped again.
    const wrong: ExplorerAssetPurpose = 'LESSON';
    expect(wrong).toBe('LESSON');
  });

  it('does not accept a purpose where a kind belongs', () => {
    // @ts-expect-error the mirror of the assertion above, in the other direction.
    const wrong: ExplorerAssetType = 'weekly_digest';
    expect(wrong).toBe('weekly_digest');
  });
});
