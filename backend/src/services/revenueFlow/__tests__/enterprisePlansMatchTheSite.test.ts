import { readFileSync } from 'fs';
import { join } from 'path';
import { ENTERPRISE_PLAN_KEYS, planOf } from '../enterprisePlans';

/**
 * R23 — the backend's three enterprise plans must be the site's three enterprise plans.
 *
 * ── WHY A BACKEND TEST READS FRONTEND SOURCE ─────────────────────────────────────────────
 *
 * Two files name the same three services: `frontend/src/config/v2Pricing.ts` sells them
 * (`SERVICE_SHAPES`), and `backend/src/services/revenueFlow/enterprisePlans.ts` counts them.
 * The backend cannot import the frontend config - separate tsconfigs, separate builds - so
 * the agreement has to be checked rather than enforced by the compiler.
 *
 * The alternative is that they drift. Somebody renames a service on the pricing page,
 * nothing fails, and the Revenue Flow board quietly reports one plan as two or as none. That
 * is the same class of defect as a legend disagreeing with the chip beside it, which is the
 * failure `revenueFlowTypes` ships the classification registry in the payload to avoid.
 *
 * This follows an established precedent in this repo rather than inventing one:
 * `backend/src/services/content/__tests__/frontendTypographyLint.test.ts` is likewise a
 * backend test whose subject is frontend source, for the same reason - the rule spans both
 * stacks and the check has to live on the side that can fail a build.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT CHECK ────────────────────────────────────────────────
 *
 * Not the labels, the order of the copy, the descriptions or the prices. Those are
 * commercial and change for commercial reasons; `enterprisePlans.ts` holds no price for
 * exactly that reason. Only the KEYS are the contract, because the key is what an intake row
 * is grouped by and what must survive a rewrite of the words.
 */

const V2_PRICING = join(
  __dirname, '..', '..', '..', '..', '..', 'frontend', 'src', 'config', 'v2Pricing.ts',
);

/**
 * Pull the keys out of the `SERVICE_SHAPES` array by reading the source.
 *
 * Parsing source with a regex is normally a bad idea and is the right one here: importing
 * the module would need the frontend's tsconfig and its React-flavoured dependency graph
 * inside a backend jest run, to learn three string literals.
 *
 * It fails loudly rather than silently returning nothing - an empty result would make this
 * whole test vacuously pass, which is the one outcome worse than a drift.
 */
function serviceShapeKeysFromSource(): string[] {
  const src = readFileSync(V2_PRICING, 'utf8');

  const start = src.indexOf('SERVICE_SHAPES');
  if (start < 0) {
    throw new Error(
      `SERVICE_SHAPES not found in ${V2_PRICING}. If the enterprise services moved, point `
      + 'this test at their new home rather than deleting it.',
    );
  }
  // From the declaration to the end of its array literal.
  const close = src.indexOf('];', start);
  if (close < 0) throw new Error('SERVICE_SHAPES array literal is not closed; cannot read its keys');
  const block = src.slice(start, close);

  const keys = Array.from(block.matchAll(/\bkey:\s*'([a-z0-9_-]+)'/g)).map((mm) => mm[1]);
  if (keys.length === 0) {
    throw new Error('found SERVICE_SHAPES but no keys inside it; the regex needs updating, not removing');
  }
  return keys;
}

describe('the enterprise plans the backend counts are the ones the site sells', () => {
  it('reads the keys out of v2Pricing.ts at all (the test can fail)', () => {
    // A positive control. Without it, a parse that returned nothing would make the
    // comparison below pass against an empty set and prove the opposite of what it claims.
    const keys = serviceShapeKeysFromSource();
    expect(keys.length).toBeGreaterThanOrEqual(3);
    expect(keys).toContain('build');
  });

  it('the three keys match exactly, in the same order', () => {
    const site = serviceShapeKeysFromSource();
    expect(site).toEqual([...ENTERPRISE_PLAN_KEYS]);
  });

  it('every site key is readable by planOf, so no real inquiry lands as unattributed', () => {
    for (const key of serviceShapeKeysFromSource()) {
      expect(planOf(key)).toBe(key);
    }
  });
});

describe('planOf is strict about what it does not know', () => {
  it('returns null for blank, whitespace and nonsense rather than guessing', () => {
    for (const v of ['', '   ', null, undefined, 'consulting', 'a partridge']) {
      expect(planOf(v as string | null | undefined)).toBeNull();
    }
  });

  it('reads the phrasings a human or a form would actually submit', () => {
    expect(planOf('A new build')).toBe('build');
    expect(planOf('build it for us')).toBe('build');
    expect(planOf('Work with your team')).toBe('guide');
    expect(planOf('work with our team please')).toBe('guide');
    expect(planOf('Training your team')).toBe('train');
    expect(planOf('training your team (10 people)')).toBe('train');
    expect(planOf('upskill engineering')).toBe('train');
  });

  it('is case and whitespace insensitive, because the field is free text', () => {
    expect(planOf('  BUILD  ')).toBe('build');
    expect(planOf('TrAiN')).toBe('train');
  });

  it('resolves a string matching two plans the same way every run', () => {
    // "build" is tried before "train", matching ENTERPRISE_PLANS' order, so this is stable
    // rather than dependent on iteration order.
    expect(planOf('a new build plus training')).toBe('build');
  });
});
