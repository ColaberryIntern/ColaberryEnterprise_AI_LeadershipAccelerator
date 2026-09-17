import * as fs from 'fs';
import * as path from 'path';
import { activationRescue } from '../../explorerGrowth/governor/candidates/activationRescue';
import { frictionRecovery } from '../../explorerGrowth/governor/candidates/frictionRecovery';
import { highIntent } from '../../explorerGrowth/governor/candidates/highIntent';
import {
  community,
  generalNurture,
  inConversation,
  personalisedLearning,
  referral,
} from '../../explorerGrowth/governor/candidates/nurture';
import type { Candidate, GovernorContext } from '../../explorerGrowth/governor/types';
import { LEARNER_OFFER_FAMILIES } from '../../../models/OfferFamily';
import type { JourneySubjectContext, LearnerFacts } from '../governor/types';
import {
  classificationNurture,
  EXPLORER_GENERATORS,
  generateLearnerCandidates,
  LEARNER_BRAND_SLUGS,
  learnerDeferrals,
  learnerEmptyReason,
  learnerStrategy,
  NO_LEARNER_PROFILE,
  toGovernorContext,
} from '../strategies/learnerStrategy';
import { AS_OF, channel, contact, cpn, ctx, facts, NO_STOPS } from './fixtures/learnerFixtures';

/**
 * T309 — the learner strategy over Explorer's own logic.
 *
 * The differential at the top is the load-bearing test: a Training subject's
 * candidate set is compared against the eight generators IMPORTED HERE
 * DIRECTLY and run on the same context — not against the strategy's own list,
 * which would be comparing the code to itself. The explicit expectation next to
 * it pins one case by hand so the comparison cannot pass by both sides being
 * wrong the same way.
 */

/* ── the differential ─────────────────────────────────────────────────────── */

describe('a Training subject gets EXACTLY the candidate set Explorer\'s own generators produce', () => {
  // Imported directly above — not through the strategy's list — so this is
  // Explorer's code against the strategy's output, not the strategy against
  // itself. Same order as decideForLearner.ts's GENERATORS.
  const explorer = [frictionRecovery, inConversation, highIntent, activationRescue, personalisedLearning, community, generalNurture, referral];
  const runExplorer = (g: GovernorContext): Candidate[] => explorer.map((f) => f(g)).filter((c): c is Candidate => c !== null);

  const CASES: Array<[string, Partial<LearnerFacts>, Partial<JourneySubjectContext['contact']['channels']>]> = [
    ['activating, engaged 12d ago', {}, {}],
    ['never engaged', { readout: { recentIntentTier: 0 } as unknown as LearnerFacts['readout'] }, {}],
    ['dormant new explorer', { primary_state: 'NEW_EXPLORER', overlays: ['DORMANT'] }, {}],
    ['friction by score', { primary_state: 'ACTIVE_LEARNER', scores: { e: 30, i: 5, f: 60 } }, {}],
    ['friction overlay, bounced email', { overlays: ['FRICTION', 'NEEDS_SUPPORT'] }, { email: channel(false, 'lead_bounced', 'lead_status') }],
    ['in conversation', { overlays: ['IN_CONVERSATION'] }, {}],
    ['high intent', { primary_state: 'CONSIDERING_NEXT_STEP', overlays: ['HIGH_INTENT'], scores: { e: 55, i: 70, f: 0 } }, {}],
    ['engaged learner with affinities', { primary_state: 'ENGAGED_LEARNER', affinities: [{ tag: 'sql', confidence: 0.8 }, { tag: 'python', confidence: 0.2 }] }, {}],
    ['connected to community', { primary_state: 'CONNECTED_TO_COMMUNITY' }, {}],
    ['referral ready', { primary_state: 'ENGAGED_LEARNER', overlays: ['REFERRAL_READY'], scores: { e: 70, i: 20, f: 0 } }, {}],
    ['email ineligible, in-app only', {}, { email: channel(false, 'no_express_consent') }],
    ['nothing reachable', {}, { email: channel(false, 'no_express_consent'), in_app: channel(false, 'no_app_account', 'none') }],
  ];

  it.each(CASES)('%s', (_label, factsOver, channels) => {
    const c = ctx({ learner: facts(factsOver), contact: contact(channels) });
    const mine = generateLearnerCandidates(c);
    const theirs = runExplorer(toGovernorContext(c, c.learner as LearnerFacts));
    expect(mine.basis).toBe('explorer_profile');
    expect(mine.candidates).toEqual(theirs);
    // Every generator is accounted for: it either emitted or is listed as silent.
    expect(mine.candidates.length + mine.not_emitted.length).toBe(explorer.length);
    expect(mine.not_emitted.every((n) => n.reason === 'predicate_false')).toBe(true);
  });

  it('and one case is pinned BY HAND, so the two sides cannot agree by both being wrong', () => {
    const c = ctx();
    const { candidates } = generateLearnerCandidates(c);
    // ACTIVATING, reachable by email, engaged 12 days ago: Explorer's tier 6
    // activation rescue and tier 9 general nurture, nothing else.
    expect(candidates.map((x) => [x.action_type, x.priority_tier, x.campaign_key])).toEqual([
      ['SEND_EMAIL', 6, 'explorer_activation_restart'],
      ['SEND_EMAIL', 9, 'explorer_weekly_digest'],
    ]);
  });

  it('the strategy\'s list is the list decideForLearner.ts runs — a ninth generator there fails here', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', 'explorerGrowth', 'governor', 'decideForLearner.ts'),
      'utf8',
    );
    const block = src.match(/const GENERATORS = \[([\s\S]*?)\];/);
    expect(block).not.toBeNull();
    const theirs = (block as RegExpMatchArray)[1].split(',').map((s) => s.trim()).filter(Boolean);
    expect(EXPLORER_GENERATORS.map((g) => g.name)).toEqual(theirs);
    expect(theirs).toHaveLength(8); // non-vacuity: the regex found the real block
  });

  it('the GovernorContext equals one built BY HAND the way runGovernor.runOne builds it', () => {
    // toGovernorContext sits on both sides of the differential above, so it is
    // pinned here against a context assembled independently, field by field,
    // from runGovernor.ts:124-155 - the same arithmetic and the same shape.
    const c = ctx();
    const f = c.learner as LearnerFacts;
    const byHand: GovernorContext = {
      enrollment_id: f.enrollment_id,
      primary_state: f.primary_state,
      overlays: f.overlays,
      scores: { e: f.scores.e, i: f.scores.i, f: f.scores.f },
      affinities: f.affinities,
      readout: f.readout,
      days_in_current_state: Math.floor((AS_OF.getTime() - new Date('2026-08-20T00:00:00Z').getTime()) / 86_400_000),
      contactability: {
        email: { eligible: true, reason: 'express_consent' },
        sms: { eligible: false, reason: 'no_express_consent' },
        voice: { eligible: false, reason: 'no_express_consent' },
        in_app: { eligible: true, reason: 'in_app_needs_no_consent' },
      },
      hardStop: { ...NO_STOPS },
      asOf: AS_OF,
    };
    expect(toGovernorContext(c, f)).toEqual(byHand);
  });

  it('builds the GovernorContext the way runGovernor does: days_in_current_state from state_entered_at', () => {
    const g = toGovernorContext(ctx(), facts());
    expect(g.days_in_current_state).toBe(25);
    expect(toGovernorContext(ctx(), facts({ state_entered_at: null })).days_in_current_state).toBe(0);
    // Contactability is T304's evidence re-shaped, not a second lookup.
    expect(g.contactability).toEqual({
      email: { eligible: true, reason: 'express_consent' },
      sms: { eligible: false, reason: 'no_express_consent' },
      voice: { eligible: false, reason: 'no_express_consent' },
      in_app: { eligible: true, reason: 'in_app_needs_no_consent' },
    });
  });
});

/* ── the brand, and the campaign key ───────────────────────────────────────── */

describe('the same profile under CPN keeps the ACTION and loses the Training CAMPAIGN', () => {
  it('withholds every explorer_* campaign key and says which one and why', () => {
    const underCpn = generateLearnerCandidates(cpn({ enrollment_id: 'enr-1', learner: facts() }));
    const underTraining = generateLearnerCandidates(ctx());
    expect(underCpn.basis).toBe('explorer_profile');
    expect(underCpn.candidates.map((c) => c.action_type)).toEqual(underTraining.candidates.map((c) => c.action_type));
    for (const c of underCpn.candidates) {
      expect(c.campaign_key).toBeNull();
      expect(c.rationale[c.rationale.length - 1]).toMatch(/^campaign_key explorer_\w+ withheld: a colaberry-training campaign, this subject is cpn$/);
    }
  });

  it('and under Training the keys are Explorer\'s own, untouched — the brand assertion', () => {
    // The plan's control: point Training at the wrong brand and THIS fails.
    const { candidates } = generateLearnerCandidates(ctx());
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) {
      expect(c.campaign_key).toMatch(/^explorer_/);
      expect(c.rationale.join(' ')).not.toContain('withheld');
    }
  });

  it('the learner brands come from the programme registry, and there are exactly two', () => {
    expect([...LEARNER_BRAND_SLUGS].sort()).toEqual(['colaberry-training', 'cpn']);
  });

  it('a learner profile under a BUSINESS brand produces no learner candidate at all', () => {
    // A person with two relationships. The AI Flotation one must never see a
    // lesson recommendation, whatever Explorer knows about them.
    const g = generateLearnerCandidates(ctx({ brand_id: 'b-flot', brand_slug: 'ai-flotation', learner: facts() }));
    expect(g.basis).toBe('none');
    expect(g.candidates).toEqual([]);
    expect(g.not_emitted).toHaveLength(8);
    expect(new Set(g.not_emitted.map((n) => n.reason))).toEqual(new Set(['brand_not_a_learner_brand:ai-flotation']));
  });

  it('and a non-learner programme kind is refused before the brand is even looked at', () => {
    const g = generateLearnerCandidates(ctx({ program_kind: 'business' }));
    expect(g.candidates).toEqual([]);
    expect(g.not_emitted[0].reason).toBe('program_kind_not_learner:business');
  });
});

/* ── no profile ────────────────────────────────────────────────────────────── */

describe('a subject with NO learner profile is never scored — the no-fabrication property', () => {
  it('runs none of the eight and records each as not emitted for that reason', () => {
    const g = generateLearnerCandidates(cpn());
    expect(g.not_emitted.filter((n) => n.reason === NO_LEARNER_PROFILE).map((n) => n.generator)).toEqual(
      EXPLORER_GENERATORS.map((x) => x.name),
    );
  });

  it('the one candidate it gets is grounded in the classification and carries no learner data', () => {
    const g = generateLearnerCandidates(cpn());
    expect(g.basis).toBe('classification_only');
    expect(g.candidates).toHaveLength(1);
    const [c] = g.candidates;
    expect(c.action_type).toBe('SEND_EMAIL');
    expect(c.priority_tier).toBe(9);
    expect(c.channel).toBe('email');
    expect(c.campaign_key).toBeNull();
    expect(c.required_assets).toEqual([{ asset_type: 'weekly_digest', offer_family: 'learner_free_training', program_slug: 'learner' }]);
    // The mutation this catches — a fabricated GovernorContext with default
    // scores — would put Explorer's state and affinity tags on the asset query
    // and Explorer's own rationale on the candidate.
    expect(c.required_assets[0]).not.toHaveProperty('state');
    expect(c.required_assets[0]).not.toHaveProperty('affinity_tags');
    expect(c.rationale.join(' ')).toContain('no learner profile');
    expect(c.rationale.join(' ')).not.toMatch(/state=|general nurture — no higher/);
  });

  it('the scores on the context are T306\'s honest answer for a learner programme: nothing, with the gap named', () => {
    const s = cpn().scores;
    expect(s.available).toBe(false);
    expect(s.summary).toBeNull();
    expect(s.gaps).toEqual(['no_dimensions_for_program:learner']);
  });

  it('with no classification there is nothing to ground, and the reason says so', () => {
    const g = generateLearnerCandidates(cpn({ classification: null }));
    expect(g.basis).toBe('none');
    expect(g.candidates).toEqual([]);
    expect(learnerEmptyReason(g)).toBe('no_learner_profile:no_classification');
  });

  it.each([
    ['a path that is not a learner family', { primary_path: 'ai_consulting' }, 'path_not_a_learner_family:ai_consulting'],
    ['a classification naming no path', { primary_path: null }, 'classification_names_no_path'],
  ])('%s grounds nothing', (_l, over, expected) => {
    const base = cpn().classification as NonNullable<JourneySubjectContext['classification']>;
    const g = generateLearnerCandidates(cpn({ classification: { ...base, ...over } }));
    expect(g.candidates).toEqual([]);
    expect(learnerEmptyReason(g)).toBe(`no_learner_profile:${expected}`);
  });

  it('an ineligible email grounds nothing either — the same condition Explorer\'s own nurture requires', () => {
    const g = generateLearnerCandidates(cpn({ contact: contact({ email: channel(false, 'no_express_consent') }) }));
    expect(g.candidates).toEqual([]);
    expect(learnerEmptyReason(g)).toBe('no_learner_profile:email_ineligible:no_express_consent');
  });

  it('every learner family grounds a candidate; no other family does', () => {
    const base = cpn().classification as NonNullable<JourneySubjectContext['classification']>;
    for (const family of LEARNER_OFFER_FAMILIES) {
      expect(classificationNurture(cpn({ classification: { ...base, primary_path: family } }))).not.toBeNull();
    }
    for (const family of ['business_training', 'ai_consulting', 'workflow_automation', 'application_build', 'ai_project', 'paid_discovery']) {
      expect(classificationNurture(cpn({ classification: { ...base, primary_path: family } }))).toBeNull();
    }
  });
});

/* ── the empty reason ──────────────────────────────────────────────────────── */

describe('what the refusal says when nothing was generated', () => {
  it('Explorer ran and found nothing: the bare class, which is Explorer\'s own answer', () => {
    const g = generateLearnerCandidates(ctx({ contact: contact({ email: channel(false, 'no_express_consent'), in_app: channel(false, 'no_app', 'none') }) }));
    expect(g.basis).toBe('explorer_profile');
    expect(g.candidates).toEqual([]);
    expect(learnerEmptyReason(g)).toBeNull();
  });

  it('a wrong brand or kind: that reason verbatim, never dressed as a missing profile', () => {
    expect(learnerEmptyReason(generateLearnerCandidates(ctx({ brand_slug: 'ai-flotation' })))).toBe('brand_not_a_learner_brand:ai-flotation');
    expect(learnerEmptyReason(generateLearnerCandidates(ctx({ program_kind: 'consulting' })))).toBe('program_kind_not_learner:consulting');
  });

  it('is null when there ARE candidates', () => {
    expect(learnerEmptyReason(generateLearnerCandidates(ctx()))).toBeNull();
    expect(learnerStrategy.emptyReason?.(ctx())).toBeNull();
  });
});

/* ── T402: the pause ───────────────────────────────────────────────────────── */

describe('T402 — a human owns the thread: the learner\'s email and lesson candidates are withheld', () => {
  const explorer = [frictionRecovery, inConversation, highIntent, activationRescue, personalisedLearning, community, generalNurture, referral];
  const runExplorer = (g: GovernorContext): Candidate[] => explorer.map((f) => f(g)).filter((c): c is Candidate => c !== null);
  const PAUSED = new Set(['SEND_EMAIL', 'RECOMMEND_LESSON']);
  const owned = (over: Partial<JourneySubjectContext['contact']> = {}): JourneySubjectContext['contact'] => ({
    ...contact(),
    human_conversation: 'yes',
    human_conversation_reason: 'open_human_conversation:handoff_accepted',
    ...over,
  });

  it('with a profile: exactly the SEND_EMAIL / RECOMMEND_LESSON candidates Explorer produced are withheld, named human_in_conversation', () => {
    const c = ctx({ learner: facts({ primary_state: 'ENGAGED_LEARNER', affinities: [{ tag: 'sql', confidence: 0.8 }] }), contact: owned() });
    const theirs = runExplorer(toGovernorContext(c, c.learner as LearnerFacts));
    expect(theirs.some((x) => PAUSED.has(x.action_type))).toBe(true); // non-vacuity
    const mine = generateLearnerCandidates(c);
    expect(mine.basis).toBe('explorer_profile');
    expect(mine.candidates).toEqual(theirs.filter((x) => !PAUSED.has(x.action_type)));
    const withheld = mine.not_emitted.filter((n) => n.reason === 'human_in_conversation');
    expect(withheld).toHaveLength(theirs.filter((x) => PAUSED.has(x.action_type)).length);
    expect(mine.candidates.length + mine.not_emitted.length).toBe(explorer.length);
  });

  it("'no' and 'unknown' withhold nothing — the profile case is Explorer's set exactly", () => {
    for (const value of ['no', 'unknown'] as const) {
      const c = ctx({ learner: facts({ primary_state: 'ENGAGED_LEARNER' }), contact: { ...contact(), human_conversation: value } });
      const mine = generateLearnerCandidates(c);
      expect(mine.candidates).toEqual(runExplorer(toGovernorContext(c, c.learner as LearnerFacts)));
      expect(mine.not_emitted.some((n) => n.reason === 'human_in_conversation')).toBe(false);
    }
  });

  it('with no profile: the classification-grounded email is withheld too, and the refusal says so', () => {
    const c = cpn({ contact: owned() });
    const g = generateLearnerCandidates(c);
    expect(g.basis).toBe('none');
    expect(g.candidates).toEqual([]);
    expect(g.not_emitted.find((n) => n.generator === 'classificationNurture')?.reason).toBe('human_in_conversation');
    expect(learnerEmptyReason(g)).toBe(`${NO_LEARNER_PROFILE}:human_in_conversation`);
    // The same subject with the human gone gets the grounded email — the pause is the only difference.
    expect(generateLearnerCandidates(cpn()).candidates.map((x) => x.action_type)).toEqual(['SEND_EMAIL']);
  });

  it('when the pause silenced every profiled candidate, the refusal names it rather than the bare class', () => {
    const c = ctx({ learner: facts({ primary_state: 'ENGAGED_LEARNER' }), contact: owned({ channels: { ...contact().channels, in_app: channel(false, 'no_app_account', 'none') } }) });
    const g = generateLearnerCandidates(c);
    if (g.candidates.length === 0) {
      expect(learnerEmptyReason(g)).toBe('human_in_conversation');
    } else {
      // Something non-commercial survived (a WAIT or a suppression): then there is no refusal to name.
      expect(g.candidates.every((x) => !PAUSED.has(x.action_type))).toBe(true);
      expect(learnerEmptyReason(g)).toBeNull();
    }
  });
});

/* ── T404: the learner queues' producer ─────────────────────────────────────── */

describe("T404 — what the learner strategy WOULD hand to a human, read from Explorer's own facts", () => {
  const withOverlays = (primary_state: LearnerFacts['primary_state'], overlays: LearnerFacts['overlays'], over: Partial<JourneySubjectContext> = {}) =>
    ctx({ learner: facts({ primary_state, overlays }), ...over });

  it('ENROLLMENT_READY with HIGH_INTENT and IN_CONVERSATION → one admissions handoff, and the strategy exposes it as defer', () => {
    const c = withOverlays('ENROLLMENT_READY', ['HIGH_INTENT', 'IN_CONVERSATION']);
    expect(learnerDeferrals(c)).toEqual([
      { would: 'create_handoff', reason: 'enrollment_ready_in_conversation', payload: { brand: 'colaberry-training', state: 'ENROLLMENT_READY', path: 'learner_free_training', layer: 4, owner: 'admissions' } },
    ]);
    expect(learnerStrategy.defer?.(c)).toEqual(learnerDeferrals(c));
  });

  it('ENROLLMENT_READY needs BOTH overlays; ACTIVATING with both yields none — the state is read, not guessed', () => {
    expect(learnerDeferrals(withOverlays('ENROLLMENT_READY', ['HIGH_INTENT']))).toEqual([]);
    expect(learnerDeferrals(withOverlays('ENROLLMENT_READY', ['IN_CONVERSATION']))).toEqual([]);
    expect(learnerDeferrals(withOverlays('ACTIVATING', ['HIGH_INTENT', 'IN_CONVERSATION']))).toEqual([]);
  });

  it("FRICTION / NEEDS_SUPPORT / f >= 25 with email ineligible → one support handoff naming the evidence's reason; email reachable → none (Explorer's own predicate)", () => {
    const bounced = contact({ email: channel(false, 'lead_bounced', 'lead_status') });
    for (const c of [
      withOverlays('ACTIVE_LEARNER', ['FRICTION'], { contact: bounced }),
      withOverlays('ACTIVE_LEARNER', ['NEEDS_SUPPORT'], { contact: bounced }),
      ctx({ learner: facts({ primary_state: 'ACTIVE_LEARNER', overlays: [], scores: { e: 30, i: 5, f: 60 } }), contact: bounced }),
    ]) {
      expect(learnerDeferrals(c)).toEqual([
        { would: 'create_handoff', reason: 'friction_email_ineligible:lead_bounced', payload: { brand: 'colaberry-training', state: 'ACTIVE_LEARNER', path: 'learner_free_training', layer: 4, owner: 'support' } },
      ]);
    }
    expect(learnerDeferrals(withOverlays('ACTIVE_LEARNER', ['FRICTION']))).toEqual([]);
    expect(learnerDeferrals(ctx({ learner: facts({ primary_state: 'ACTIVE_LEARNER', overlays: [], scores: { e: 30, i: 5, f: 24 } }), contact: bounced }))).toEqual([]);
  });

  it('the friction line is Explorer\'s own, 25, read from frictionRecovery.ts', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'explorerGrowth', 'governor', 'candidates', 'frictionRecovery.ts'), 'utf8');
    expect(src).toContain('const FRICTION_THRESHOLD = 25;');
    const mine = fs.readFileSync(path.join(__dirname, '..', 'strategies', 'learnerStrategy.ts'), 'utf8');
    expect(mine).toContain('const FRICTION_THRESHOLD = 25;');
  });

  it('no profile, or a non-learner programme, defers nothing', () => {
    expect(learnerDeferrals(cpn())).toEqual([]);
    expect(learnerDeferrals(withOverlays('ENROLLMENT_READY', ['HIGH_INTENT', 'IN_CONVERSATION'], { program_kind: 'business' }))).toEqual([]);
  });
});

/* ── T405: the cooldown ────────────────────────────────────────────────────── */

describe('T405 — a human sent the learner back: EVERY candidate is withheld while the RETURNED_TO_AI overlay is on', () => {
  const explorer = [frictionRecovery, inConversation, highIntent, activationRescue, personalisedLearning, community, generalNurture, referral];
  const runExplorer = (g: GovernorContext): Candidate[] => explorer.map((f) => f(g)).filter((c): c is Candidate => c !== null);
  const COOLDOWN = 'RETURNED_TO_AI';
  const REASON = 'returned_to_ai_cooldown';

  it('with a profile: every candidate Explorer produced is withheld, each named returned_to_ai_cooldown; the predicate-false generators still say so', () => {
    const c = ctx({ learner: facts({ primary_state: 'ENGAGED_LEARNER', affinities: [{ tag: 'sql', confidence: 0.8 }] }), overlays: [COOLDOWN] });
    const theirs = runExplorer(toGovernorContext(c, c.learner as LearnerFacts));
    expect(theirs.length).toBeGreaterThanOrEqual(2); // non-vacuity: more than the two the T402 pause withholds
    const mine = generateLearnerCandidates(c);
    expect(mine.basis).toBe('explorer_profile');
    expect(mine.candidates).toEqual([]);
    expect(mine.not_emitted.filter((n) => n.reason === REASON)).toHaveLength(theirs.length);
    expect(mine.not_emitted.filter((n) => n.reason === 'predicate_false')).toHaveLength(explorer.length - theirs.length);
    expect(learnerEmptyReason(mine)).toBe(REASON);
  });

  it("the overlay is on the CONTEXT, not on Explorer's facts: the same profile without it is Explorer's set exactly", () => {
    const c = ctx({ learner: facts({ primary_state: 'ENGAGED_LEARNER' }), overlays: [] });
    const mine = generateLearnerCandidates(c);
    expect(mine.candidates).toEqual(runExplorer(toGovernorContext(c, c.learner as LearnerFacts)));
    expect(mine.not_emitted.some((n) => n.reason === REASON)).toBe(false);
  });

  it("the cooldown outranks the human pause in the record: a profiled subject with both carries the cooldown's name", () => {
    const c = ctx({ learner: facts({ primary_state: 'ENGAGED_LEARNER' }), overlays: [COOLDOWN], contact: { ...contact(), human_conversation: 'yes' } });
    const mine = generateLearnerCandidates(c);
    expect(mine.candidates).toEqual([]);
    expect(mine.not_emitted.some((n) => n.reason === 'human_in_conversation')).toBe(false);
    expect(learnerEmptyReason(mine)).toBe(REASON);
  });

  it('with no profile: the classification-grounded email is withheld too, and the refusal says so', () => {
    const g = generateLearnerCandidates(cpn({ overlays: [COOLDOWN] }));
    expect(g.basis).toBe('none');
    expect(g.candidates).toEqual([]);
    expect(g.not_emitted.find((n) => n.generator === 'classificationNurture')?.reason).toBe(REASON);
    expect(learnerEmptyReason(g)).toBe(`${NO_LEARNER_PROFILE}:${REASON}`);
    expect(generateLearnerCandidates(cpn()).candidates.map((x) => x.action_type)).toEqual(['SEND_EMAIL']);
  });

  it('nothing is deferred either: the admissions and support handoffs wait out the cooldown', () => {
    const c = ctx({ learner: facts({ primary_state: 'ENROLLMENT_READY', overlays: ['HIGH_INTENT', 'IN_CONVERSATION'] }) });
    expect(learnerDeferrals(c)).toHaveLength(1); // non-vacuity
    expect(learnerDeferrals({ ...c, overlays: [COOLDOWN] })).toEqual([]);
  });
});
