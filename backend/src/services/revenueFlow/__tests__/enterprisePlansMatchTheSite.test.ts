import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ENTERPRISE_PLAN_KEYS,
  SERVICE_ANSWERS,
  normalizeService,
  planOf,
} from '../enterprisePlans';

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

/**
 * R23 Phase 5 — the INTAKE FORM's four answers must be the four the backend stores.
 *
 * The same argument as the pricing-page check above, on the write side instead of the read
 * side. The form posts a value; this module decides what that value may be. Nothing in
 * either language can enforce the agreement across two tsconfigs, so it is checked.
 *
 * This is the test that makes Phase 5's design safe. The form used to post DISPLAY words,
 * and it worked by coincidence for three of the four because "Build" lowercases to "build".
 * Somebody restoring that, or adding a fifth chip, or renaming a value to match a copy
 * change, breaks revenue attribution silently: the funnel keeps rendering, the stages keep
 * adding up, and the new answers quietly pile into "Plan not recorded". That is exactly the
 * failure mode the pricing-page test was written for, so it gets the same treatment.
 */
const DEMO_PILOT_MODEL = join(
  __dirname, '..', '..', '..', '..', '..',
  'frontend', 'src', 'pages', 'publicV2', 'demoPilotModel.ts',
);

/**
 * The `value:` entries of `SERVICE_CHOICES`, read out of the source.
 *
 * Reading source with a regex for the same reason the pricing check does: importing a
 * frontend module would need the frontend's tsconfig and its React dependency graph inside
 * a backend jest run, to learn four string literals. It throws rather than returning nothing,
 * because an empty result would make every assertion below vacuously true.
 */
function serviceChoiceValuesFromSource(): string[] {
  const src = readFileSync(DEMO_PILOT_MODEL, 'utf8');

  const start = src.indexOf('SERVICE_CHOICES');
  if (start < 0) {
    throw new Error(
      `SERVICE_CHOICES not found in ${DEMO_PILOT_MODEL}. If the intake form's service `
      + 'answers moved, point this test at their new home rather than deleting it.',
    );
  }
  const close = src.indexOf('];', start);
  if (close < 0) throw new Error('SERVICE_CHOICES array literal is not closed; cannot read its values');

  const values = Array.from(src.slice(start, close).matchAll(/\bvalue:\s*'([a-z0-9_-]+)'/g))
    .map((m) => m[1]);
  if (values.length === 0) {
    throw new Error('found SERVICE_CHOICES but no values inside it; the regex needs updating, not removing');
  }
  return values;
}

describe('the answers the intake form submits are the ones the backend stores', () => {
  it('reads the values out of demoPilotModel.ts at all (the test can fail)', () => {
    // The positive control, same as the pricing check has.
    const values = serviceChoiceValuesFromSource();
    expect(values.length).toBeGreaterThanOrEqual(4);
    expect(values).toContain('build');
  });

  it('matches SERVICE_ANSWERS exactly, in the same order', () => {
    expect(serviceChoiceValuesFromSource()).toEqual([...SERVICE_ANSWERS]);
  });

  it('every value the form can post survives normalization unchanged', () => {
    // The stronger claim, and the one that actually protects the funnel: not merely that the
    // lists match, but that a real submission from this form is already canonical, so the
    // stored row never depends on the lenient phrase matching meant for legacy input.
    for (const value of serviceChoiceValuesFromSource()) {
      expect(normalizeService(value)).toBe(value);
    }
  });

  it('the three plan keys are the first three, so a plan is never posted as "not sure"', () => {
    expect(serviceChoiceValuesFromSource().slice(0, 3)).toEqual([...ENTERPRISE_PLAN_KEYS]);
  });

  it('the form no longer offers the service question as optional', () => {
    // The requirement is what closes the gap this phase exists for: before it, a skipped
    // question was indistinguishable on the board from a question nobody asked. Asserted on
    // the validator rather than the markup, because the validator is what blocks the submit.
    const src = readFileSync(DEMO_PILOT_MODEL, 'utf8');
    expect(src).toMatch(/e\.service\s*=/);
  });
});
