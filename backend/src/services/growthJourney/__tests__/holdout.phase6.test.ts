const m = { policy: jest.fn() };

jest.mock('../../../config/env', () => ({
  env: { nodeEnv: 'test', databaseUrl: 'postgres://test:test@localhost:5432/test' },
}));
jest.mock('../../../models', () => ({
  GrowthJourneyPolicy: { findOne: (...a: unknown[]) => m.policy(...a) },
  GrowthJourneyDecision: { count: jest.fn(), findAll: jest.fn() },
  GrowthJourneyOutcome: { count: jest.fn() },
}));

import { bucket } from '../../explorerGrowth/explorerExperimentService';
import { decideForSubject } from '../governor/decideForSubject';
import { assignJourneyArm, isJourneyHoldoutEligible, JOURNEY_HOLDOUT_PURPOSES } from '../experiments/assignJourneyArm';
import { holdoutSettingsSchema, lookupHoldoutPolicy } from '../experiments/holdoutPolicy';
import type { GrowthJourneyFlags } from '../../../config/growthJourneyFlags';
import type { DecideDeps, JourneyCandidate, JourneyStrategy, JourneySubjectContext } from '../governor/types';

/**
 * T608 — the holdout: who may be withheld, from what, and what the record says.
 *
 * The three properties, in the order they would hurt if wrong:
 *
 *   1. NOBODY IS WITHHELD FROM HELP. Eligibility is a code allowlist keyed on
 *      what a message is ABOUT, and a policy may only narrow it. A handoff, an
 *      Ali outreach, a clarification question and a candidate that declares no
 *      purpose at all are all ineligible, so an operator cannot make them
 *      experimentable by editing a row.
 *   2. NO POLICY MEANS NO CHANGE. The dependency is optional; without it the
 *      decision is byte-identical to the Phase 3 one. The control below is a
 *      deep equality of two whole decisions, not a spot check.
 *   3. THE ARMS ARE MEASURED ON IDENTICAL ELIGIBILITY. The arm is assigned AFTER
 *      the contact policy, so a person the contact policy refuses is recorded as
 *      `contact_policy:...` and carries no arm - they are in neither arm rather
 *      than silently in control.
 */

const flags = (): GrowthJourneyFlags =>
  Object.freeze({
    growthJourneyEnabled: true,
    journeySignalIngest: false,
    journeyClassification: false,
    journeyDecisions: true,
    journeyHandoffs: false,
    journeyExecution: false,
  });

const KEY = 'gj_case_study_lift';

const candidate = (over: Partial<JourneyCandidate> = {}): JourneyCandidate => ({
  action_type: 'SEND_EMAIL',
  campaign_key: 'gj_capability_education',
  priority_tier: 7,
  intra_tier_score: 50,
  channel: 'email',
  required_assets: [{ asset_type: 'case_study' } as unknown as JourneyCandidate['required_assets'][number]],
  rationale: ['a business lead asked about automation'],
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
  classification: {
    classification_id: 'c-1',
    brand_relationship: 'colaberry-enterprise',
    primary_path: 'workflow_automation',
    secondary_paths: [],
    intent: 'automation_request',
    requires_human_review: false,
    source_step: 3,
  },
  state: 'PROBLEM_IDENTIFIED',
  state_entered_at: new Date('2026-09-10T00:00:00Z'),
  overlays: [],
  scores: { dimensions: [], summary: null, gaps: [], available: false, computed_at: null },
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
    human_conversation_reason: 'no source',
    sales_capacity: 'unknown',
    sales_capacity_reason: 'no source',
    failed_closed: false,
  },
  hardStop: { converted: false, unsubscribed: false, dnc: false, consentRevoked: false, killSwitch: false, campaignInactive: false },
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

const deps = (over: Partial<DecideDeps> = {}): DecideDeps => ({
  assertOfferAllowed: async () => undefined,
  contactPolicyFor: () => ({
    channelEligible: true,
    consent: { verdict: 'allow', reason: 'granted', hasRecord: true },
    recentContactCount: 0,
    hoursSinceLastContact: null,
  }),
  resolveContent: async () => ({ assets: [{ id: 'a-1' }], gaps: [] }),
  ...over,
});

/**
 * Two subjects, DERIVED from the real bucket rather than hard-coded.
 *
 * A holdout share is capped at 0.5 by the policy schema, so a subject whose
 * bucket is above 0.5 can never be in control - there is no legal share that
 * would hold them back. A hard-coded id would therefore have encoded a silent
 * assumption about the hash; picking them by measuring it says the constraint
 * out loud and cannot rot if the hash ever changes.
 *
 * With one realistic 50% holdout, these two fall on either side of it.
 */
const CONTROL_SHARE = 0.5;
const subjects = Array.from({ length: 60 }, (_, i) => `lead:${500 + i}`);
const CONTROL_SUBJECT = subjects.find((sub) => bucket(KEY, sub) < CONTROL_SHARE)!;
const TREATMENT_SUBJECT = subjects.find((sub) => bucket(KEY, sub) >= CONTROL_SHARE)!;

const holdout = (share = CONTROL_SHARE, candidateTypes?: string[]) => async () => ({
  experiment_key: KEY,
  control_share: share,
  ...(candidateTypes ? { candidate_types: candidateTypes } : {}),
});

const subjectCtx = (subjectRef: string) => ctx({ subject_ref: subjectRef, lead_id: Number(subjectRef.split(':')[1]) });

const decide = async (d: DecideDeps, c = ctx(), cands = [candidate()]) => {
  const out = await decideForSubject(c, strategy(cands), d, flags());
  if (out.status !== 'decided') throw new Error(`expected a decision, got ${out.status}`);
  return out.decision;
};

beforeEach(() => jest.clearAllMocks());

/* ── 1. nobody is withheld from help ────────────────────────────────────────── */

describe('eligibility is a code allowlist, and a policy may only narrow it', () => {
  it('the two promotional purposes are the whole list', () => {
    expect([...JOURNEY_HOLDOUT_PURPOSES]).toEqual(['capability_education', 'case_study']);
  });

  it.each([
    ['CREATE_HUMAN_TASK', 'a handoff to a human is help'],
    ['SEND_ALI_OUTREACH', "Ali's own outreach keeps its own caps"],
    ['WAIT', 'contacts nobody'],
    ['SUPPRESS_CONTACT', 'contacts nobody'],
  ])('%s is never eligible (%s)', (action) => {
    // `it.each` widens the tuple to `string`; the candidate wants `ExplorerActionType`. The cast is
    // the test asserting about a real action name, which the scoped `tsc` is what caught.
    expect(isJourneyHoldoutEligible(candidate({ action_type: action as JourneyCandidate['action_type'] }))).toBe(false);
  });

  it('a clarification question is NOT eligible, though it is the same action type as a case study', () => {
    const asking = candidate({ required_assets: [{ asset_type: 'clarification_question' } as never] });
    expect(isJourneyHoldoutEligible(asking)).toBe(false);
    expect(isJourneyHoldoutEligible(candidate())).toBe(true);
  });

  it('a candidate that declares no purpose fails CLOSED', () => {
    expect(isJourneyHoldoutEligible(candidate({ required_assets: [] }))).toBe(false);
  });

  it('a mixed-purpose candidate fails closed rather than being judged on its first asset', () => {
    const mixed = candidate({
      required_assets: [{ asset_type: 'case_study' } as never, { asset_type: 'clarification_question' } as never],
    });
    expect(isJourneyHoldoutEligible(mixed)).toBe(false);
  });

  it('`candidate_types` may NARROW the allowlist and can never widen it', () => {
    // Narrowing: an eligible action left out of the list becomes ineligible.
    expect(isJourneyHoldoutEligible(candidate(), ['SHOW_IN_APP_NUDGE'])).toBe(false);
    expect(isJourneyHoldoutEligible(candidate(), ['SEND_EMAIL'])).toBe(true);
    // Widening: naming a handoff does NOT make it experimentable.
    expect(isJourneyHoldoutEligible(candidate({ action_type: 'CREATE_HUMAN_TASK' }), ['CREATE_HUMAN_TASK'])).toBe(false);
    // Nor does naming a candidate whose purpose is not promotional.
    const asking = candidate({ required_assets: [{ asset_type: 'clarification_question' } as never] });
    expect(isJourneyHoldoutEligible(asking, ['SEND_EMAIL'])).toBe(false);
  });

  it('an ineligible candidate gets NO arm - not "treatment"', () => {
    const arm = assignJourneyArm({
      experimentKey: KEY, subjectRef: 'lead:501', controlShare: 0.5,
      candidate: candidate({ action_type: 'CREATE_HUMAN_TASK' }),
    });
    expect(arm).toBeNull();
  });
});

/* ── 2. the arm is stable, and it is Explorer's bucket ──────────────────────── */

describe('assignment is deterministic and per experiment', () => {
  it('the same subject and key always land in the same arm, over many draws', () => {
    const args = { experimentKey: KEY, subjectRef: 'lead:501', controlShare: 0.5, candidate: candidate() };
    const arms = new Set(Array.from({ length: 50 }, () => assignJourneyArm(args)));
    expect(arms.size).toBe(1);
  });

  it('uses Explorer\'s bucket rather than a second hash', () => {
    const subject = 'lead:777';
    const b = bucket(KEY, subject);
    // Straddle the real bucket value: the arm must follow it exactly.
    expect(assignJourneyArm({ experimentKey: KEY, subjectRef: subject, controlShare: Math.min(0.5, b + 0.01), candidate: candidate() })).toBe('control');
    expect(assignJourneyArm({ experimentKey: KEY, subjectRef: subject, controlShare: Math.max(0.0001, b - 0.01), candidate: candidate() })).toBe('treatment');
  });

  it('a subject\'s position is independent per experiment key', () => {
    const subject = 'lead:501';
    expect(bucket(KEY, subject)).not.toEqual(bucket('gj_other_experiment', subject));
  });
});

/* ── 3. the governor: no policy means no change ─────────────────────────────── */

describe('the hook, in the decision path', () => {
  it('THE CONTROL: with no policy dependency the decision is deep-equal to the Phase 3 one', async () => {
    const withoutDep = await decide(deps());
    const withDepButNoPolicy = await decide(deps({ holdoutPolicyFor: async () => null }));
    expect(withDepButNoPolicy).toEqual(withoutDep);
    expect(withoutDep.experiment_key).toBeUndefined();
    expect(withoutDep.holdout_group).toBeUndefined();
  });

  it('both subjects exist: one the experiment can hold back, one it cannot', () => {
    expect(CONTROL_SUBJECT).toBeDefined();
    expect(TREATMENT_SUBJECT).toBeDefined();
    expect(bucket(KEY, CONTROL_SUBJECT)).toBeLessThan(CONTROL_SHARE);
    expect(bucket(KEY, TREATMENT_SUBJECT)).toBeGreaterThanOrEqual(CONTROL_SHARE);
  });

  it('the treatment arm is the no-policy decision plus two stamps, and nothing else', async () => {
    const base = await decide(deps(), subjectCtx(TREATMENT_SUBJECT));
    const treated = await decide(deps({ holdoutPolicyFor: holdout() }), subjectCtx(TREATMENT_SUBJECT));
    expect(treated).toEqual({ ...base, experiment_key: KEY, holdout_group: 'treatment' });
    expect(treated.selected_action).toBe('SEND_EMAIL');
  });

  it('the control arm becomes WAIT, names the suppression, and keeps no channel or content', async () => {
    const control = await decide(deps({ holdoutPolicyFor: holdout() }), subjectCtx(CONTROL_SUBJECT));
    expect(control).toMatchObject({
      selected_action: 'WAIT',
      selected_channel: null,
      selected_content: null,
      experiment_key: KEY,
      holdout_group: 'control',
      reason: `chosen_then_blocked:SEND_EMAIL:holdout:${KEY}`,
    });
    expect(control.suppressed).toEqual(
      expect.arrayContaining([{ action_type: 'SEND_EMAIL', campaign_key: 'gj_capability_education', reason: `holdout:${KEY}` }]),
    );
  });

  it('a WAIT carries nothing for the executor to send: no channel, no content, no campaign chosen', async () => {
    const control = await decide(deps({ holdoutPolicyFor: holdout() }), subjectCtx(CONTROL_SUBJECT));
    // The execution planner keys off `selected_action`; a WAIT is not a sendable decision, which is
    // what makes "no receipt ever" a property of the decision rather than of a downstream check.
    expect(control.selected_action).toBe('WAIT');
    expect(control.selected_channel).toBeNull();
    expect(control.selected_content).toBeNull();
  });

  it('an ineligible winner is untouched even with an active policy', async () => {
    const handoff = [candidate({ action_type: 'CREATE_HUMAN_TASK', channel: 'none', required_assets: [] })];
    const base = await decide(deps(), ctx(), handoff);
    const withPolicy = await decide(deps({ holdoutPolicyFor: holdout() }), ctx(), handoff);
    expect(withPolicy).toEqual(base);
    expect(withPolicy.holdout_group).toBeUndefined();
  });

  it('THE ORDERING PROPERTY: a contact-policy refusal is recorded as such and carries NO arm', async () => {
    // sec 25.3 - both arms must be measured on identical eligibility. If the arm were assigned before
    // the contact policy, this subject would be stamped `control` and counted, while an identical
    // treatment subject would be refused. The control arm would fill with unreachable people.
    const blocked = deps({
      holdoutPolicyFor: holdout(),
      contactPolicyFor: () => ({
        channelEligible: false,
        channelReason: 'no_consent',
        consent: { verdict: 'block', reason: 'no_consent', hasRecord: true },
        recentContactCount: 0,
        hoursSinceLastContact: null,
      }),
    });
    const d = await decide(blocked, subjectCtx(CONTROL_SUBJECT));
    expect(d.selected_action).toBe('WAIT');
    // The refusal names the contact policy in the suppression and the verdict's own reason in
    // `reason` - the governor's existing shape, unchanged by this task.
    expect(d.suppressed).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: 'contact_policy:no_consent' })]),
    );
    expect(d.reason).toBe('chosen_then_blocked:SEND_EMAIL:no_consent');
    expect(d.reason).not.toContain('holdout');
    expect(d.suppressed.map((x) => x.reason).join('|')).not.toContain('holdout');
    expect(d.experiment_key ?? null).toBeNull();
    expect(d.holdout_group ?? null).toBeNull();
  });

  it('a content gap is likewise recorded as itself, with no arm', async () => {
    const gapped = deps({
      holdoutPolicyFor: holdout(),
      resolveContent: async () => ({ assets: [], gaps: ['no_approved_asset'] }),
    });
    const d = await decide(gapped, subjectCtx(CONTROL_SUBJECT));
    expect(d.reason).toContain('content_gap');
    expect(d.holdout_group ?? null).toBeNull();
  });
});

/* ── 4. the policy row is validated, and every absence is a named absence ───── */

describe('the policy read', () => {
  const row = (over: Record<string, unknown> = {}) => {
    const values: Record<string, unknown> = {
      brand_id: 'b-ent', status: 'active',
      settings: { experiment_key: KEY, control_share: 0.2 },
      ...over,
    };
    return { get: (k: string) => values[k] };
  };

  it('reads the row by brand and type, and answers the parsed policy', async () => {
    m.policy.mockResolvedValue(row());
    const out = await lookupHoldoutPolicy('b-ent');
    expect(out).toEqual({ policy: { brand_id: 'b-ent', experiment_key: KEY, control_share: 0.2 }, reason: 'active' });
    expect((m.policy.mock.calls[0][0] as { where: Record<string, unknown> }).where)
      .toEqual({ brand_id: 'b-ent', policy_type: 'holdout_experiment' });
  });

  it('no row, a paused row and an invalid row are three NAMED absences', async () => {
    m.policy.mockResolvedValue(null);
    expect(await lookupHoldoutPolicy('b-ent')).toEqual({ policy: null, reason: 'no_policy' });
    m.policy.mockResolvedValue(row({ status: 'paused' }));
    expect(await lookupHoldoutPolicy('b-ent')).toEqual({ policy: null, reason: 'not_active' });
    m.policy.mockResolvedValue(row({ settings: { experiment_key: KEY } }));
    expect(await lookupHoldoutPolicy('b-ent')).toEqual({ policy: null, reason: 'settings_invalid' });
  });

  it('FAILS CLOSED: a lookup that throws is an absence, never an escaping error', async () => {
    m.policy.mockRejectedValue(new Error('connection reset'));
    await expect(lookupHoldoutPolicy('b-ent')).resolves.toEqual({ policy: null, reason: 'lookup_failed' });
  });

  it('the schema refuses a control share that is not a holdout', () => {
    for (const bad of [0, -0.1, 0.51, 1, 2]) {
      expect(holdoutSettingsSchema.safeParse({ experiment_key: KEY, control_share: bad }).success).toBe(false);
    }
    expect(holdoutSettingsSchema.safeParse({ experiment_key: KEY, control_share: 0.5 }).success).toBe(true);
  });

  it('the schema refuses an experiment key that could not be safely used anywhere', () => {
    for (const bad of ['', 'Has Caps', "key'; DROP TABLE", 'a'.repeat(65)]) {
      expect(holdoutSettingsSchema.safeParse({ experiment_key: bad, control_share: 0.2 }).success).toBe(false);
    }
  });

  it('a malformed settings row is an ABSENCE, never a default control share', async () => {
    m.policy.mockResolvedValue(row({ settings: { experiment_key: KEY, control_share: 0.9 } }));
    const out = await lookupHoldoutPolicy('b-ent');
    expect(out.policy).toBeNull();
    expect(out.reason).toBe('settings_invalid');
  });
});
