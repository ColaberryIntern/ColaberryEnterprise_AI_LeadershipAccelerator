import * as fs from 'fs';
import * as path from 'path';
import { arbitrate, SORT_KEYS } from '../../../explorerGrowth/governor/arbiter';
import { decideForSubject } from '../decideForSubject';
import { OfferNotEligibleError } from '../../offerEligibility';
import { SCAN_DIRS, phase2SourceFiles } from '../../__tests__/phase2Sources';
import { TIER_SETTING_CANDIDATES, tierFor } from './fixtures/tierSetter';
import type { DecideDeps, JourneyCandidate, JourneyStrategy, JourneySubjectContext } from '../types';

/**
 * Section 7.3 allows ONE arbitration point across every journey programme. This
 * is the test that keeps it one (T303).
 *
 * WHY THIS GUARD IS STRUCTURAL AND NOT A LIST OF PATTERNS
 *
 * Attempt 1 scanned for comparator SHAPES - a sort with a ranking field in its
 * comparator, a subtraction of two tiers, a localeCompare. The verifier broke it
 * in the way that matters: it wrote four realistic second arbiters the scan did
 * not see, including the most natural refactor of all, reading the field into a
 * local variable first, plus a lodash orderBy with a string field name, a lodash
 * sortBy with an accessor, and bracket-notation access. A guard that knows only
 * the shapes somebody already tried is a guard against repetition.
 *
 * So the rule is now about the DATA rather than the syntax:
 *
 *   under services/growthJourney, a ranking field may be WRITTEN as an object
 *   key and must never be READ.
 *
 * A second arbiter has to read a tier to compare it - by any syntax, through any
 * helper, into any local. A generator only ever writes one. That makes the guard
 * indifferent to how a comparison is spelled, and it costs nothing today: no
 * non-test file under this tree reads either field.
 */

const GJ_DIR = path.join(__dirname, '..', '..');
const RANKING_FIELDS = ['priority_tier', 'intra_tier_score'] as const;

/** A second arbiter can arrive as an import as easily as a loop. */
const RANKING_UTILITIES = [
  'lodash',
  'lodash-es',
  'ramda',
  'sort-by',
  'array-sort',
  'fast-sort',
];

/**
 * The files to scan: `phase2SourceFiles()`, the SAME list the no-send scanner
 * walks - `services/growthJourney` AND `services/routing`.
 *
 * Attempt 2's verifier defeated the directory-scoped version by putting the
 * comparison in `services/routing/` and calling it from a one-line wrapper in
 * this tree: zero literal occurrences here, a full second arbiter next door.
 * Sharing one file list means a guard cannot be bypassed by choosing a folder,
 * and the test below fails if the two lists ever diverge.
 */
function scannedFiles(): string[] {
  return phase2SourceFiles();
}

const rel = (f: string) => path.relative(path.join(GJ_DIR, '..'), f).replace(/\\/g, '/');

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/**
 * Every READ of a ranking field, by any syntax.
 *
 * A write is `priority_tier:` - an object-literal key, which is what a generator
 * does. Anything else naming the field is a read: a property access, a bracket
 * lookup, a bare string handed to a helper, a destructure.
 */
export function rankingFieldReads(source: string): string[] {
  const code = stripComments(source);
  const reads: string[] = [];
  for (const field of RANKING_FIELDS) {
    const rx = new RegExp(`(.{0,12})\\b${field}\\b(.{0,6})`, 'g');
    for (const m of code.matchAll(rx)) {
      const before = m[1] ?? '';
      const after = m[2] ?? '';
      const quotedKey = /['"]\s*$/.test(before) && /^['"]\s*:/.test(after);
      const plainKey = !/['"[.]\s*$/.test(before) && /^\s*:/.test(after);
      if (quotedKey || plainKey) continue;
      reads.push(`${field}${after.trim().slice(0, 2)}`);
    }
  }
  return reads;
}

describe('the structural guard: nothing under growthJourney READS a ranking field', () => {
  const files = scannedFiles();

  it('scans a non-trivial number of files, so a passing scan means something', () => {
    expect(files.length).toBeGreaterThanOrEqual(15);
  });

  it('walks the SAME tree as the no-send scanner, so neither can be bypassed by choosing a folder', () => {
    // The bypass attempt 2's verifier found: a second arbiter in
    // `services/routing/` called from a one-line wrapper in `growthJourney/`.
    // Both guards now share one file list; if a third directory is ever added
    // to this run, it is added once and both guards see it.
    const dirs = SCAN_DIRS.map((d) => d.replace(/\\/g, '/'));
    expect(dirs.some((d) => d.endsWith('services/growthJourney'))).toBe(true);
    expect(dirs.some((d) => d.endsWith('services/routing'))).toBe(true);
    expect(dirs).toHaveLength(2);
    // And the routing tree really is in the list this guard walks.
    expect(files.some((f) => f.replace(/\\/g, '/').includes('/services/routing/'))).toBe(true);
  });

  it('no production file reads priority_tier or intra_tier_score', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const reads = rankingFieldReads(fs.readFileSync(f, 'utf8'));
      if (reads.length > 0) offenders.push(`${rel(f)} -> reads ${reads.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('no production file imports a ranking utility', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const code = stripComments(fs.readFileSync(f, 'utf8'));
      for (const spec of [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])) {
        if (RANKING_UTILITIES.some((u) => spec === u || spec.startsWith(`${u}/`))) {
          offenders.push(`${rel(f)} -> ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('catches every second-arbiter idiom, including the four that defeated the shape scan', () => {
    // These are the verifier's own snippets from attempt 1. Four of them passed
    // the old scan while implementing exactly what this task forbids.
    const secondArbiters: Array<[string, string]> = [
      ['lodash orderBy with a string field name', "return orderBy(candidates, ['priority_tier'], ['asc'])[0];"],
      ['lodash sortBy with an accessor', 'return sortBy(candidates, (c) => c.priority_tier)[0];'],
      [
        'reduce with local variable extraction',
        'const bt = best.priority_tier; const ct = c.priority_tier; return ct < bt ? c : best;',
      ],
      [
        'for loop with local variable extraction',
        'let wt = winner.priority_tier; for (const c of cs) { const t = c.priority_tier; if (t < wt) wt = t; }',
      ],
      ['reduce with a direct dot compare', 'return c.priority_tier < best.priority_tier ? c : best;'],
      ['bracket-notation reduce', "return c['priority_tier'] < best['priority_tier'] ? c : best;"],
      ['ternary over the tie-break score', 'return a.intra_tier_score > b.intra_tier_score ? a : b;'],
      ['destructured read', 'const { priority_tier } = candidate; if (priority_tier < best) return candidate;'],
    ];

    const slipped = secondArbiters.filter(([, code]) => rankingFieldReads(code).length === 0).map(([n]) => n);
    expect(slipped).toEqual([]);
  });

  it('leaves honest code alone: writing a tier is not ranking one', () => {
    // The negative control the plan audit required. A generator must set a tier;
    // if this fails, the guard has become useless in the other direction.
    const control = fs.readFileSync(path.join(__dirname, 'fixtures', 'tierSetter.ts'), 'utf8');
    expect(control).toContain('priority_tier');
    expect(rankingFieldReads(control)).toEqual([]);
    expect(TIER_SETTING_CANDIDATES).toHaveLength(3);
    expect(tierFor(90)).toBe(3);

    for (const honest of [
      'const c = { action_type: "SEND_EMAIL", priority_tier: 7, intra_tier_score: 40 };',
      'candidates.push({ priority_tier: tierFor(score), intra_tier_score: score });',
      "const c = { 'priority_tier': 3 };",
      // The two real sorts in this tree, neither of which ranks a candidate.
      '[...allowed].filter((f) => !denied.has(f)).sort()',
      'Object.entries(v).sort(([a], [b]) => a.localeCompare(b))',
    ]) {
      expect(rankingFieldReads(honest)).toEqual([]);
    }
  });

  it('decideForSubject imports the arbiter rather than re-implementing it', () => {
    const src = fs.readFileSync(path.join(GJ_DIR, 'governor', 'decideForSubject.ts'), 'utf8');
    expect(src).toMatch(/import \{ arbitrate \} from '\.\.\/\.\.\/explorerGrowth\/governor\/arbiter'/);
    expect(src).toMatch(/hardStopReason/);
    expect(src).toMatch(/evaluateContact/);
    expect(src).toMatch(/evaluateFreshness/);
    expect(SORT_KEYS.length).toBeGreaterThanOrEqual(4);
  });
});

/* ── the differential ─────────────────────────────────────────────────────── */

const candidate = (over: Partial<JourneyCandidate> = {}): JourneyCandidate => ({
  action_type: 'SEND_EMAIL',
  campaign_key: 'gj_test',
  priority_tier: 7,
  intra_tier_score: 50,
  channel: 'email',
  required_assets: [],
  rationale: ['fixture'],
  ...over,
});

const ctx = (over: Partial<JourneySubjectContext> = {}): JourneySubjectContext => ({
  tenant_id: 't-col',
  brand_id: 'b-ent',
  brand_slug: 'colaberry-enterprise',
  program_id: 'p-ent',
  program_slug: 'business-growth',
  program_status: 'draft',
  program_kind: 'business',
  subject_ref: 'lead:501',
  lead_id: 501,
  enrollment_id: null,
  classification: null,
  state: 'NEW_BUSINESS_LEAD',
  state_entered_at: new Date('2026-09-10T00:00:00Z'),
  overlays: [],
  scores: { dimensions: [], summary: null, gaps: ['fit:no_source'], available: false, computed_at: null },
  contact: {
    channels: {
      email: { eligible: true, reason: 'ok', evaluator: 'consent', last_contact_at: null, hours_since_last_contact: null },
      sms: { eligible: false, reason: 'no_consent', evaluator: 'consent', last_contact_at: null, hours_since_last_contact: null },
      voice: { eligible: false, reason: 'no_consent', evaluator: 'consent', last_contact_at: null, hours_since_last_contact: null },
      in_app: { eligible: true, reason: 'always', evaluator: 'none', last_contact_at: null, hours_since_last_contact: null },
      none: { eligible: true, reason: 'no channel needed', evaluator: 'none', last_contact_at: null, hours_since_last_contact: null },
    },
    recent_contact_count: 0,
    hours_since_last_contact: null,
    human_conversation: 'unknown',
    human_conversation_reason: 'no source in this codebase',
    sales_capacity: 'unknown',
    sales_capacity_reason: 'no source in this codebase',
    failed_closed: false,
  },
  hardStop: {
    converted: false,
    unsubscribed: false,
    dnc: false,
    consentRevoked: false,
    killSwitch: false,
    campaignInactive: false,
  },
  freshness: { created_at: new Date('2026-09-01T00:00:00Z'), scores_computed_at: new Date('2026-09-13T00:00:00Z') },
  asOf: new Date('2026-09-13T06:00:00Z'),
  ...over,
});

const strategy = (candidates: JourneyCandidate[]): JourneyStrategy => ({
  program_kind: 'business',
  ruleset_version: 'p3-v1',
  hardStops: (c) => c.hardStop,
  generate: () => candidates,
});

const FLAGS_ON = {
  growthJourneyEnabled: true,
  journeySignalIngest: false,
  journeyClassification: false,
  journeyDecisions: true,
  journeyHandoffs: false,
  journeyExecution: false,
} as const;

const deps = (over: Partial<DecideDeps> = {}): DecideDeps => ({
  assertOfferAllowed: async () => undefined,
  contactPolicyFor: () => ({
    channelEligible: true,
    consent: { verdict: 'allow', reason: 'ok', hasRecord: true },
    recentContactCount: 0,
    hoursSinceLastContact: null,
  }),
  ...over,
});

describe('the differential: the pipeline returns the arbiter\'s own answer', () => {
  const set = [
    candidate({ action_type: 'SEND_EMAIL', priority_tier: 9, intra_tier_score: 30, campaign_key: 'low' }),
    candidate({ action_type: 'RECOMMEND_LESSON', priority_tier: 7, intra_tier_score: 80, campaign_key: 'mid' }),
    candidate({ action_type: 'CREATE_HUMAN_TASK', priority_tier: 3, intra_tier_score: 10, channel: 'none', campaign_key: null }),
  ];

  /**
   * Known human inputs for the differential, and the reason matters.
   *
   * Step 4b suppresses `CREATE_HUMAN_TASK` and `SEND_ALI_OUTREACH` while
   * `human_conversation` or `sales_capacity` is unknown - which is every subject
   * today - and `set` contains the first at tier 3, where it wins. A differential
   * over two different input sets would prove nothing about the RANKING, which is
   * what these two cases exist to pin. The filtered case gets its own differential
   * below rather than being folded in here.
   */
  const knownInputs = () =>
    ctx({ contact: { ...ctx().contact, human_conversation: 'no', sales_capacity: 'available' } });

  it('picks the same winner and the same suppression reasons as arbitrate() directly', async () => {
    const direct = arbitrate(set);
    const out = await decideForSubject(knownInputs(), strategy(set), deps(), FLAGS_ON);
    if (out.status !== 'decided') throw new Error('expected a decision');

    expect(out.decision.selected_action).toBe(direct.winner?.action_type);
    expect(out.decision.suppressed.map((s) => s.reason).sort()).toEqual(
      direct.suppressed.map((s) => s.reason).sort(),
    );
    // Every loser is accounted for: one winner, the rest suppressed with reasons.
    expect(out.decision.suppressed).toHaveLength(set.length - 1);
    for (const s of out.decision.suppressed) expect(s.reason.length).toBeGreaterThan(0);
  });

  it('order of the input does not change the answer, because the arbiter is a total order', async () => {
    const a = await decideForSubject(ctx(), strategy(set), deps(), FLAGS_ON);
    const b = await decideForSubject(ctx(), strategy([...set].reverse()), deps(), FLAGS_ON);
    if (a.status !== 'decided' || b.status !== 'decided') throw new Error('expected decisions');
    expect(a.decision.selected_action).toBe(b.decision.selected_action);
  });

  it('uses the arbiter\'s suppression vocabulary, not one of its own', async () => {
    const out = await decideForSubject(knownInputs(), strategy(set), deps(), FLAGS_ON);
    if (out.status !== 'decided') throw new Error('expected a decision');
    for (const s of out.decision.suppressed) {
      expect(s.reason).toMatch(/^(outranked within tier|lower priority than tier)/);
    }
  });

  it('with an unknown input, the answer is still the arbiter\'s — over the filtered set', async () => {
    // The differential that the unknown-input rule earns: the filter removes a
    // candidate from the FIELD and changes nothing about the order. Same list
    // minus the human action, straight through `arbitrate`, must equal what the
    // pipeline answers for a subject whose inputs are unknown. Were the filter to
    // re-rank, or to run after arbitration and substitute a runner-up, this fails.
    const human = new Set(['CREATE_HUMAN_TASK', 'SEND_ALI_OUTREACH']);
    const direct = arbitrate(set.filter((c) => !human.has(c.action_type)));
    const out = await decideForSubject(ctx(), strategy(set), deps(), FLAGS_ON);
    if (out.status !== 'decided') throw new Error('expected a decision');

    expect(out.decision.selected_action).toBe(direct.winner?.action_type);
    const arbiterReasons = out.decision.suppressed
      .map((s) => s.reason)
      .filter((r) => !r.endsWith('_unknown') && !r.includes('_unknown,'));
    expect(arbiterReasons.sort()).toEqual(direct.suppressed.map((s) => s.reason).sort());
    // Every candidate is still accounted for: one winner, the rest suppressed —
    // one of them by the unknown-input rule, the others by the arbiter.
    expect(out.decision.suppressed).toHaveLength(set.length - 1);
    expect(out.decision.suppressed.map((s) => s.reason)).toContain(
      'human_conversation_unknown,sales_capacity_unknown',
    );
  });

  it('re-checks the WINNER against the brand boundary, not only the field of candidates', async () => {
    // This task's own prose promised "every candidate before arbitration and
    // again on the winner". The verifier found the second half missing. It is
    // defence in depth - the winner is drawn from the filtered set, so nothing
    // denied can win today - but T308's hard training exclusion is specified as
    // two checks, and a decision naming an offer the brand may not make is the
    // one output this phase must never produce.
    let call = 0;
    const assertOfferAllowed = jest.fn(async () => {
      call += 1;
      if (call <= set.length) return undefined;
      throw new OfferNotEligibleError({
        allowed: false,
        reason: 'explicit_deny',
        brand_id: 'b-ent',
        offer_family: 'business_training',
        policy_id: 'pol-deny',
        approved_content_ready: false,
      });
    });

    const withFamily = set.map((c) => ({
      ...c,
      required_assets: [{ asset_type: 'lesson_recommendation', offer_family: 'business_training' } as never],
    }));
    const out = await decideForSubject(ctx(), strategy(withFamily), deps({ assertOfferAllowed }), FLAGS_ON);
    if (out.status !== 'decided') throw new Error('expected a decision');

    expect(assertOfferAllowed).toHaveBeenCalledTimes(withFamily.length + 1);
    expect(out.decision.selected_action).toBe('WAIT');
    expect(out.decision.reason).toBe('winner_not_eligible:explicit_deny');
    expect(out.decision.requires_human_review).toBe(true);
  });
});
