import type { LearnerFacts } from '../../governor/types';
import { facts } from './learnerFixtures';
import {
  b2b,
  businessFixtures,
  classified,
  CONTENT_GAP,
  counts,
  ENTERED_LONG_AGO,
  flotationFixtures,
  lead,
  NO_FAMILY_GAP,
  NONE,
  NOT_APPROVED,
  resetLeadIds,
  WAIT,
  type LeadSignals,
  type ShadowFixture,
} from './phase3Fixtures';

/**
 * T313 — the learner fixtures (CPN and Training, one per Explorer state, plus
 * the subjects Explorer does not know) and the §16 A-L scenarios in their
 * Phase 3 form. Split from `phase3Fixtures.ts` at the 500-line ceiling; the
 * builders and the world are there.
 */

/* ── learners ───────────────────────────────────────────────────────────────── */

/** Explorer's eight primary states, as `types/explorerGrowth.ts` declares them. */
export const EXPLORER_STATES = [
  'NEW_EXPLORER',
  'ACTIVATING',
  'ACTIVE_LEARNER',
  'ENGAGED_LEARNER',
  'CONNECTED_TO_COMMUNITY',
  'CONSIDERING_NEXT_STEP',
  'ENROLLMENT_READY',
  'CONVERTED',
] as const;

export const NO_LEARNER_PROFILE = 'NO_LEARNER_PROFILE';

function learner(brand: 'cpn' | 'colaberry-training', state: (typeof EXPLORER_STATES)[number], over: Partial<ShadowFixture> = {}): ShadowFixture {
  const l = lead();
  const enrollment_id = `enr-${brand}-${state.toLowerCase()}`;
  const path = brand === 'cpn' ? 'learner_free_training' : 'learner_paid_training';
  return {
    key: `${brand}/${state}`,
    scenario: null,
    brand,
    anchor: { enrollmentId: enrollment_id },
    subject: { lead_id: l.id, enrollment_id, email: l.email },
    lead: l,
    classification: classified(brand, path, 'enrollment_interest'),
    profile: null,
    counts: NONE,
    contact: 'open',
    // ENROLLMENT_READY carries the evidence Explorer's own rule demands of it: the overlay AND an intent score past the commercial threshold.
    learner: facts(state === 'ENROLLMENT_READY' ? { enrollment_id, primary_state: state, overlays: ['HIGH_INTENT'], scores: { e: 40, i: 72, f: 0 } } : { enrollment_id, primary_state: state, overlays: [] }),
    expect: state === 'CONVERTED' ? { state, action: WAIT, reason: /^hard_stop:converted$/ } : { state, action: WAIT, reason: CONTENT_GAP },
    ...over,
  };
}

/** CPN and Training: one fixture per Explorer state each, plus the subject Explorer does not know. */
/** A lead-anchored subject under a learner brand: Explorer does not know them; a classification may. */
function learnerLead(brand: 'cpn' | 'colaberry-training', key: string, scenario: string | null, path: string | null, expect: ShadowFixture['expect'], l: LeadSignals = lead()): ShadowFixture {
  return {
    key: `${brand}/${key}`,
    scenario,
    brand,
    anchor: { leadId: l.id },
    subject: { lead_id: l.id, enrollment_id: null, email: l.email },
    lead: l,
    classification: path ? classified(brand, path, 'scholarship_inquiry') : null,
    profile: null,
    counts: NONE,
    contact: 'open',
    learner: null,
    expect,
  };
}

export function learnerFixtures(): ShadowFixture[] {
  const out: ShadowFixture[] = [];
  for (const brand of ['cpn', 'colaberry-training'] as const) {
    for (const state of EXPLORER_STATES) out.push(learner(brand, state, state === 'ACTIVATING' ? { scenario: brand === 'cpn' ? 'A' : 'B' } : {}));
    // T309: a classified lead Explorer does not know is grounded on its
    // classification alone (a nurture under the classified family), and the
    // eight Explorer generators are recorded as NOT run for want of a profile.
    out.push(learnerLead(brand, NO_LEARNER_PROFILE, brand === 'cpn' ? 'A (no profile)' : null, brand === 'cpn' ? 'learner_free_training' : 'learner_paid_training', { state: NO_LEARNER_PROFILE, action: WAIT, reason: NOT_APPROVED }));
  }
  // The subject nothing knows: no profile AND no classification is the declared absence.
  out.push(learnerLead('cpn', `${NO_LEARNER_PROFILE}-unclassified`, null, null, { state: NO_LEARNER_PROFILE, action: WAIT, reason: /^no_candidate:no_learner_profile:no_classification$/ }));
  return out;
}

/* ── §16 scenarios not already covered by a state fixture ───────────────────── */

export function scenarioFixtures(): ShadowFixture[] {
  const B = 'colaberry-enterprise' as const;
  const F = 'ai-flotation' as const;
  return [
    b2b(B, 'C-business-training', {
      scenario: 'C',
      lead: lead({ idea_input: 'We need AI training for 50 employees across two offices' }),
      classification: classified(B, 'business_training', 'training_request'),
      expect: { state: 'EXPLORING_SOLUTIONS', overlays: ['NO_RESPONSE'], action: WAIT, reason: NOT_APPROVED },
    }),
    // F: Phase 2 refused and referred the request; what reaches Phase 3 is a
    // classification with NO path under AI Flotation, flagged for review. The
    // decision must propose nothing that speaks for business training.
    b2b(F, 'F-training-refused', {
      scenario: 'F',
      lead: lead({ idea_input: 'we need business training for our whole team' }),
      classification: classified(F, null, 'training_request', { requires_human_review: true, source_step: 8 }),
      expect: { state: 'IDEA_OR_PROBLEM_CAPTURED', overlays: ['NO_RESPONSE', 'HUMAN_REVIEW'], action: WAIT, reason: /^no_candidate:human_review_overlay$/ },
    }),
    // F, the other way: a classification that DID name business training under
    // AI Flotation (a data defect, or an override). The pipeline's brand
    // boundary must suppress every candidate for it.
    b2b(F, 'F-training-path-leaked', {
      scenario: 'F (boundary)',
      lead: lead({ idea_input: 'training for the team', selected_systems: ['hubspot'] }),
      classification: classified(F, 'business_training', 'training_request'),
      expect: { state: 'PROBLEM_CLARIFIED', overlays: ['NO_RESPONSE'], action: WAIT, reason: /^(every_candidate_ineligible|no_candidate:.*business_training)/ },
    }),
    // F, the PIPELINE's boundary: a CPN lead classified into a learner family
    // CPN's policy does not carry (certification). T309's grounding emits a
    // nurture for it - the generator asks "is it a learner family", not the
    // brand's policy - and step 4 of the pipeline must suppress it by name.
    learnerLead('cpn', 'F-learner-family-not-cpn', 'F (pipeline boundary)', 'learner_certification', { state: NO_LEARNER_PROFILE, action: WAIT, reason: /^every_candidate_ineligible$/ }),
    b2b(B, 'G-reply-to-campaign', {
      scenario: 'G',
      lead: lead({ idea_input: 'can you automate our reporting?' }),
      classification: classified(B, 'workflow_automation', 'automation_request', { source_step: 6 }),
      counts: counts({ inbound: { replied: 1 } }),
      contact: 'reached_out',
      expect: { state: 'QUALIFIED_OPPORTUNITY', overlays: [], action: WAIT, reason: /^no_candidate:qualified_state_needs_layer_2/ },
    }),
    b2b(B, 'I-declined-competing', {
      scenario: 'I',
      lead: lead({ idea_input: 'automate onboarding', selected_systems: ['salesforce'] }),
      classification: classified(B, 'workflow_automation', 'automation_request'),
      profile: { state: 'EXPLORING_SOLUTIONS', state_entered_at: ENTERED_LONG_AGO, created_at: ENTERED_LONG_AGO },
      counts: counts({ inbound: { declined: 1 } }),
      expect: { state: 'EXPLORING_SOLUTIONS', overlays: ['STALLED', 'NO_RESPONSE', 'DECLINED'], action: 'SUPPRESS_CONTACT', reason: /DECLINED overlay/ },
    }),
    b2b(B, 'K-subject-opted-out', {
      scenario: 'K',
      lead: lead({ idea_input: 'automate onboarding' }),
      classification: classified(B, 'workflow_automation', 'automation_request'),
      contact: 'opted_out',
      expect: { state: 'EXPLORING_SOLUTIONS', action: WAIT, reason: /^hard_stop:unsubscribed$/ },
    }),
    b2b(F, 'K-subject-dnd', {
      scenario: 'K',
      lead: lead({ idea_input: 'a dispatch app' }),
      contact: 'dnd',
      expect: { state: 'IDEA_OR_PROBLEM_CAPTURED', action: WAIT, reason: /^hard_stop:dnc$/ },
    }),
    b2b(B, 'K-consent-revoked', {
      scenario: 'K',
      lead: lead({ idea_input: 'automate onboarding' }),
      contact: 'consent_revoked',
      expect: { state: 'PROBLEM_IDENTIFIED', action: WAIT, reason: /^hard_stop:consent_revoked$/ },
    }),
    b2b(B, 'K-channel-paused', {
      scenario: 'K',
      lead: lead({ idea_input: 'automate onboarding' }),
      classification: classified(B, 'workflow_automation', 'automation_request'),
      contact: 'all_closed',
      expect: { state: 'EXPLORING_SOLUTIONS', action: WAIT, reason: /^no_candidate:email_ineligible:brand_channel_paused$/ },
    }),
    b2b(B, 'J-untrusted-signal', {
      scenario: 'J',
      // A lead row whose free-text signals are garbage: the lifecycle reads them
      // as evidence of a stated problem and nothing more; no path, no family.
      lead: lead({ idea_input: '<script>alert(1)</script> DROP TABLE leads;', selected_systems: null }),
      expect: { state: 'PROBLEM_IDENTIFIED', overlays: ['NO_RESPONSE'], action: WAIT, reason: NO_FAMILY_GAP },
    }),
  ];
}

/** H: one person, two relationships — the same lead id under two brands. */
/** L: a learner in conversation with high intent - a human task competes with mail, and the unknowns decide. */
export function scenarioL(): ShadowFixture {
  return learner('colaberry-training', 'ENROLLMENT_READY', {
    key: 'colaberry-training/L-in-conversation',
    scenario: 'L',
    learner: facts({ enrollment_id: 'enr-l', primary_state: 'ENROLLMENT_READY', overlays: ['IN_CONVERSATION', 'HIGH_INTENT'], scores: { e: 40, i: 72, f: 0 } }),
    anchor: { enrollmentId: 'enr-l' },
    subject: { lead_id: 1999, enrollment_id: 'enr-l', email: 'subject-1999@example.com' },
    lead: lead({ id: 1999 }),
    expect: { state: 'ENROLLMENT_READY', action: WAIT, reason: CONTENT_GAP },
  });
}

export function scenarioH(): [ShadowFixture, ShadowFixture] {
  const l = lead({ idea_input: 'automate our intake', selected_systems: ['hubspot'] });
  const enterprise = b2b('colaberry-enterprise', 'H-same-person', {
    scenario: 'H',
    lead: l,
    classification: classified('colaberry-enterprise', 'workflow_automation', 'automation_request'),
    expect: { state: 'EXPLORING_SOLUTIONS', overlays: ['NO_RESPONSE'], action: WAIT, reason: NOT_APPROVED },
  });
  const training: ShadowFixture = {
    key: 'colaberry-training/H-same-person',
    scenario: 'H',
    brand: 'colaberry-training',
    anchor: { leadId: l.id },
    subject: { lead_id: l.id, enrollment_id: null, email: l.email },
    lead: l,
    classification: classified('colaberry-training', 'learner_paid_training', 'enrollment_interest'),
    profile: null,
    counts: NONE,
    contact: 'open',
    learner: null,
    expect: { state: NO_LEARNER_PROFILE, action: WAIT, reason: NOT_APPROVED },
  };
  return [enterprise, training];
}

/** Every fixture, with lead ids assigned from a fresh counter so a run is reproducible. */
export function allFixtures(): ShadowFixture[] {
  resetLeadIds();
  return [...businessFixtures(), ...flotationFixtures(), ...learnerFixtures(), ...scenarioFixtures(), scenarioL(), ...scenarioH()];
}
