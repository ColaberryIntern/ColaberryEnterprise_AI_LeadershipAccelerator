import {
  BRAIN_RULES_SETTING,
  brainRulesKeyFor,
  loadBrainRules,
  saveBrainRules,
  DEFAULT_BRAIN_RULES,
  type BrainRulesDeps,
} from '../brainRules';

/**
 * Maya's rules, per brand.
 *
 * ─── THE TWO CELLS THIS FILE EXISTS FOR ─────────────────────────────────────
 *
 * 1. **Nothing changes until somebody sets a brand's rules.** This touches the
 *    path that decides what Maya says, so on the day it ships, with no brand
 *    rows anywhere, every read must return exactly what it returned before.
 *
 * 2. **Saving one brand cannot change another's.** The whole point is that
 *    Colaberry Enterprise can carry a different voice from Colaberry Training.
 *    If a save leaked across, the first person to edit Enterprise would silently
 *    rewrite what Maya says to 1,191 Training learners. That is asserted on the
 *    KEYS WRITTEN rather than on a later read, because a read-back test passes
 *    against an implementation that writes both and happens to read the right
 *    one.
 */

const BRAND = '11111111-2222-3333-4444-555555555555';
const OTHER = '99999999-8888-7777-6666-555555555555';

/**
 * Rule sets that are recognisably not the default, so a mix-up is visible.
 *
 * They differ on `brainPickMinHours` and `neverSay`, NOT on `explorerVoice`.
 * The first draft used a short marker string for the voice and every cell
 * failed: `resolveBrainRules` rejects a voice that short and substitutes the
 * real one, reporting a problem. The fixture was invalid, not the code - but it
 * failed loudly, which is the behaviour you want from that validator.
 *
 * All three cadences below are valid members of the allowed set and all three
 * differ, so default, global and brand are told apart by value rather than by
 * which key happened to be read.
 */
const DEFAULT_CADENCE = 72;
const GLOBAL_CADENCE = 96;
const BRAND_CADENCE = 48;

const brandRules = () => ({
  ...DEFAULT_BRAIN_RULES,
  neverSay: ['circle back'],
  brainPickMinHours: BRAND_CADENCE,
});

const globalRules = () => ({
  ...DEFAULT_BRAIN_RULES,
  neverSay: ['synergy'],
  brainPickMinHours: GLOBAL_CADENCE,
});

/** A settings store that records every key touched, in order. */
function store(seed: Record<string, unknown> = {}) {
  const reads: string[] = [];
  const writes: Array<{ key: string; value: unknown; adminId?: string }> = [];
  const data: Record<string, unknown> = { ...seed };
  const deps: BrainRulesDeps = {
    getSetting: async (key) => { reads.push(key); return data[key] ?? null; },
    setSetting: async (key, value, adminId) => { writes.push({ key, value, adminId }); data[key] = value; },
  };
  return { deps, reads, writes, data };
}

describe('brainRulesKeyFor', () => {
  it('with no brand, it is the key the rules have always lived under', () => {
    // Load-bearing: if this ever returns something else, every existing
    // deployment silently loses its saved rules and falls back to defaults.
    expect(brainRulesKeyFor(null)).toBe('maya_brain_rules');
    expect(brainRulesKeyFor(null)).toBe(BRAIN_RULES_SETTING);
    expect(brainRulesKeyFor(undefined)).toBe(BRAIN_RULES_SETTING);
  });

  it('a brand gets its own key, derived from its id', () => {
    expect(brainRulesKeyFor(BRAND)).toBe(`maya_brain_rules:${BRAND}`);
    expect(brainRulesKeyFor(BRAND)).not.toBe(brainRulesKeyFor(OTHER));
  });
});

describe('nothing changes until a brand has its own rules', () => {
  it('no brand: reads the global key and only the global key', async () => {
    const { deps, reads } = store({ [BRAIN_RULES_SETTING]: globalRules() });

    const r = await loadBrainRules(null, deps);

    expect(r.rules.brainPickMinHours).toBe(GLOBAL_CADENCE);
    expect(r.source).toBe('global');
    expect(r.brand_id).toBeNull();
    // Exactly the one read it always did. A second read would be a behaviour
    // change on the hot path, not just an extra query.
    expect(reads).toEqual([BRAIN_RULES_SETTING]);
  });

  it('a brand with no rules of its own falls back to the global set, and says so', async () => {
    const { deps, reads } = store({ [BRAIN_RULES_SETTING]: globalRules() });

    const r = await loadBrainRules(BRAND, deps);

    expect(r.rules.brainPickMinHours).toBe(GLOBAL_CADENCE);
    expect(r.source).toBe('global');
    // The brand is still echoed, so the caller knows which brand fell back.
    expect(r.brand_id).toBe(BRAND);
    expect(reads).toEqual([brainRulesKeyFor(BRAND), BRAIN_RULES_SETTING]);
  });

  it('with nothing stored anywhere the answer is the defaults, called `default` not `global`', async () => {
    const { deps } = store();

    const r = await loadBrainRules(BRAND, deps);

    expect(r.rules).toEqual(DEFAULT_BRAIN_RULES);
    // Pinned by value as well as by object equality, and deliberately different
    // from both fixtures: if the defaults ever drifted to match one of them,
    // every "fell back correctly" cell above would still pass while proving
    // nothing.
    expect(r.rules.brainPickMinHours).toBe(DEFAULT_CADENCE);
    expect(DEFAULT_CADENCE).not.toBe(GLOBAL_CADENCE);
    expect(DEFAULT_CADENCE).not.toBe(BRAND_CADENCE);
    // `global` would assert that a saved global set is in force. Nobody has
    // saved one. An operator told `global` goes looking for a record that does
    // not exist.
    expect(r.source).toBe('default');
    expect(r.stored).toBe(false);
  });
});

describe('a brand with its own rules', () => {
  it('gets them, and the global set is not even read', async () => {
    const { deps, reads } = store({
      [BRAIN_RULES_SETTING]: globalRules(),
      [brainRulesKeyFor(BRAND)]: brandRules(),
    });

    const r = await loadBrainRules(BRAND, deps);

    expect(r.rules.brainPickMinHours).toBe(BRAND_CADENCE);
    
    expect(r.source).toBe('brand');
    expect(reads).toEqual([brainRulesKeyFor(BRAND)]);
  });

  it('is taken whole, never merged with the global set', async () => {
    // Half one brand's voice and half another's is a personality nobody chose,
    // and no operator could predict what Maya would say.
    const { deps } = store({
      [BRAIN_RULES_SETTING]: { ...globalRules(), neverSay: ['synergy', 'leverage'] },
      [brainRulesKeyFor(BRAND)]: brandRules(),
    });

    const r = await loadBrainRules(BRAND, deps);

    expect(r.rules.neverSay).toEqual(['circle back']);
    expect(r.rules.neverSay).not.toContain('synergy');
  });
});

describe('saving one brand cannot touch another', () => {
  it('writes that brand key and nothing else', async () => {
    const { deps, writes } = store({ [BRAIN_RULES_SETTING]: globalRules() });

    await saveBrainRules(brandRules(), 'ali@colaberry.com', BRAND, deps);

    // Asserted on keys WRITTEN, not on a later read: a read-back assertion
    // passes against an implementation that writes both keys and happens to
    // read the right one.
    expect(writes.map((w) => w.key)).toEqual([brainRulesKeyFor(BRAND)]);
    expect(writes.map((w) => w.key)).not.toContain(BRAIN_RULES_SETTING);
    expect(writes[0].adminId).toBe('ali@colaberry.com');
  });

  it('leaves the other brand and the global set exactly as they were', async () => {
    const { deps, data } = store({
      [BRAIN_RULES_SETTING]: globalRules(),
      [brainRulesKeyFor(OTHER)]: { ...DEFAULT_BRAIN_RULES, brainPickMinHours: 120 },
    });
    const globalBefore = JSON.stringify(data[BRAIN_RULES_SETTING]);
    const otherBefore = JSON.stringify(data[brainRulesKeyFor(OTHER)]);

    await saveBrainRules(brandRules(), 'ali@colaberry.com', BRAND, deps);

    // Byte-identical, which is the claim. "Still looks about right" is how a
    // clobber survives a test.
    expect(JSON.stringify(data[BRAIN_RULES_SETTING])).toBe(globalBefore);
    expect(JSON.stringify(data[brainRulesKeyFor(OTHER)])).toBe(otherBefore);
  });

  it('with no brand it still writes the global key, as every existing caller expects', async () => {
    const { deps, writes } = store();

    await saveBrainRules(globalRules(), 'ali@colaberry.com', null, deps);

    expect(writes.map((w) => w.key)).toEqual([BRAIN_RULES_SETTING]);
  });

  it('one brand reads its own set while another still reads the global one', async () => {
    // The end-to-end shape of the feature, in one cell.
    const { deps } = store({ [BRAIN_RULES_SETTING]: globalRules() });

    await saveBrainRules(brandRules(), 'ali@colaberry.com', BRAND, deps);

    const mine = await loadBrainRules(BRAND, deps);
    const theirs = await loadBrainRules(OTHER, deps);

    expect(mine.rules.brainPickMinHours).toBe(BRAND_CADENCE);
    expect(mine.source).toBe('brand');
    expect(theirs.rules.brainPickMinHours).toBe(GLOBAL_CADENCE);
    expect(theirs.source).toBe('global');
  });
});

describe('the store failing is the defaults, flagged, for a brand too', () => {
  it('reports `default` and names the problem rather than throwing', async () => {
    const deps: BrainRulesDeps = {
      getSetting: async () => { throw new Error('db down'); },
      setSetting: jest.fn(),
    };

    const r = await loadBrainRules(BRAND, deps);

    expect(r.rules).toEqual(DEFAULT_BRAIN_RULES);
    expect(r.source).toBe('default');
    expect(r.stored).toBe(false);
    expect(r.brand_id).toBe(BRAND);
    expect(r.problems[0]).toContain('could not be read');
  });
});
