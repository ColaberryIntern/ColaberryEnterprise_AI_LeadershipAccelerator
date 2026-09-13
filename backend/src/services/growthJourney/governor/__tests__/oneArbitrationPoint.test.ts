import * as fs from 'fs';
import * as path from 'path';
import { arbitrate, SORT_KEYS } from '../../../explorerGrowth/governor/arbiter';
import { decideForSubject } from '../decideForSubject';
import { TIER_SETTING_CANDIDATES, tierFor } from './fixtures/tierSetter';
import type { JourneyCandidate, JourneyStrategy, JourneySubjectContext } from '../types';

/**
 * §7.3 allows ONE arbitration point across every journey programme. This is the
 * test that keeps it one (T303).
 *
 * Two halves, because either alone can be fooled: a SOURCE scan proving no file
 * under `services/growthJourney/` ranks candidates itself, and a DIFFERENTIAL
 * proving the pipeline's answer is the arbiter's own answer rather than a
 * coincidentally similar one.
 */

const GJ_DIR = path.join(__dirname, '..', '..');

function sources(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      sources(p, out);
    } else if (e.name.endsWith('.ts')) {
      out.push(p);
    }
  }
  return out;
}

const rel = (f: string) => path.relative(GJ_DIR, f).replace(/\\/g, '/');

/**
 * A comparator over tiers, not the identifier.
 *
 * Looking for `priority_tier` itself would flag every honest generator, since a
 * generator must set a tier. These patterns look for the act of RANKING: a sort
 * with a comparator body, a subtraction of two tiers, or a `localeCompare` over
 * action types. `fixtures/tierSetter.ts` is the negative control below.
 */
const COMPARATORS: Array<{ name: string; rx: RegExp }> = [
  // NOT a bare `.sort((` — that flagged two honest sorts on the first run:
  // `offerEligibility` orders offer families by catalog position, and
  // `classificationService` orders JSON keys for its stable input hash. Neither
  // ranks a candidate. So the pattern is a sort whose COMPARATOR BODY reaches
  // for a ranking field, which is what arbitration would have to do.
  { name: 'sort ranking by tier or score', rx: /\.sort\(\s*\([^)]*\)\s*=>[\s\S]{0,200}?(priority_tier|intra_tier_score)/ },
  { name: 'subtraction of two tiers', rx: /priority_tier\s*[-<>]=?\s*\w+\.priority_tier/ },
  { name: 'tier compared to a tier', rx: /\.priority_tier\s*[<>]/ },
  { name: 'localeCompare over action types', rx: /action_type\.localeCompare/ },
  { name: 'intra-tier score compared', rx: /intra_tier_score\s*[-<>]=?\s*\w+\.intra_tier_score/ },
];

describe('the source scan: nothing under growthJourney ranks candidates itself', () => {
  const files = sources(GJ_DIR).filter((f) => !f.includes('__tests__'));

  it('scans a non-trivial number of files, so a passing scan means something', () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  it('no production file contains a comparator over tiers or scores', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const { name, rx } of COMPARATORS) {
        if (rx.test(src)) offenders.push(`${rel(f)} -> ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the negative control is NOT flagged: setting a tier is not ranking', () => {
    // If this ever fails, the scan above has become too broad and would start
    // flagging honest generators — which is how a guard like this dies.
    const control = fs.readFileSync(path.join(__dirname, 'fixtures', 'tierSetter.ts'), 'utf8');
    expect(control).toContain('priority_tier');
    for (const { rx } of COMPARATORS) expect(rx.test(control)).toBe(false);
    expect(TIER_SETTING_CANDIDATES).toHaveLength(3);
    expect(tierFor(90)).toBe(3);
  });

  it('a comparator ADDED to a growth-journey file would be caught (the scan bites)', () => {
    const planted = `
      const ordered = [...candidates].sort((a, b) => a.priority_tier - b.priority_tier);
    `;
    const caught = COMPARATORS.filter(({ rx }) => rx.test(planted)).map((c) => c.name);
    expect(caught).toContain('sort ranking by tier or score');
    expect(caught).toContain('subtraction of two tiers');

    // A subtler shape: no sort at all, just a direct comparison of two tiers.
    const subtle = 'if (a.priority_tier < b.priority_tier) return a;';
    expect(COMPARATORS.some(({ rx }) => rx.test(subtle))).toBe(true);

    // And the honest shapes the scan must NOT flag: a sort with no ranking
    // field in its comparator, which is what the two real files in this tree do.
    for (const honest of [
      "[...allowed].filter((f) => !denied.has(f)).sort()",
      ".sort((a, b) => a.brand_slug.localeCompare(b.brand_slug))",
      "Object.entries(v).sort(([a], [b]) => a.localeCompare(b))",
    ]) {
      expect(COMPARATORS.some(({ rx }) => rx.test(honest))).toBe(false);
    }
  });

  it('decideForSubject imports the arbiter rather than re-implementing it', () => {
    const src = fs.readFileSync(path.join(GJ_DIR, 'governor', 'decideForSubject.ts'), 'utf8');
    expect(src).toMatch(/import \{ arbitrate \} from '\.\.\/\.\.\/explorerGrowth\/governor\/arbiter'/);
    expect(src).toMatch(/hardStopReason/);
    expect(src).toMatch(/evaluateContact/);
    expect(src).toMatch(/evaluateFreshness/);
    // The four sort keys stay the arbiter's business, not this module's.
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
  journeyExecution: false,
} as const;

const deps = {
  assertOfferAllowed: async () => undefined,
  contactPolicyFor: () => ({
    channelEligible: true,
    consent: { verdict: 'allow' as const, reason: 'ok', hasRecord: true },
    recentContactCount: 0,
    hoursSinceLastContact: null,
  }),
};

describe('the differential: the pipeline returns the arbiter\'s own answer', () => {
  const set = [
    candidate({ action_type: 'SEND_EMAIL', priority_tier: 9, intra_tier_score: 30, campaign_key: 'low' }),
    candidate({ action_type: 'RECOMMEND_LESSON', priority_tier: 7, intra_tier_score: 80, campaign_key: 'mid' }),
    candidate({ action_type: 'CREATE_HUMAN_TASK', priority_tier: 3, intra_tier_score: 10, channel: 'none', campaign_key: null }),
  ];

  it('picks the same winner and the same suppression reasons as arbitrate() directly', async () => {
    const direct = arbitrate(set);
    const out = await decideForSubject(ctx(), strategy(set), deps, FLAGS_ON);
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
    const a = await decideForSubject(ctx(), strategy(set), deps, FLAGS_ON);
    const b = await decideForSubject(ctx(), strategy([...set].reverse()), deps, FLAGS_ON);
    if (a.status !== 'decided' || b.status !== 'decided') throw new Error('expected decisions');
    expect(a.decision.selected_action).toBe(b.decision.selected_action);
  });

  it('uses the arbiter\'s suppression vocabulary, not one of its own', async () => {
    const out = await decideForSubject(ctx(), strategy(set), deps, FLAGS_ON);
    if (out.status !== 'decided') throw new Error('expected a decision');
    for (const s of out.decision.suppressed) {
      expect(s.reason).toMatch(/^(outranked within tier|lower priority than tier)/);
    }
  });
});
