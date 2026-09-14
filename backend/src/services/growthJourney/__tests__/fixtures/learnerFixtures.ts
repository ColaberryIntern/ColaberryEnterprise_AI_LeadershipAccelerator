import type { GrowthJourneyFlags } from '../../../../config/growthJourneyFlags';
import { scoreSubject } from '../../scoring/scoreVector';
import type { DecideDeps, JourneySubjectContext, LearnerFacts } from '../../governor/types';

/**
 * Shared fixtures for the T309 learner-strategy suites: a Training learner
 * Explorer knows, a CPN scholarship lead it does not, and the pipeline deps.
 * Split out when `learnerStrategy.test.ts` crossed the 500-line ceiling.
 */

export const AS_OF = new Date('2026-09-14T12:00:00Z');

export const flags = (): GrowthJourneyFlags => ({
  growthJourneyEnabled: true,
  journeySignalIngest: false,
  journeyClassification: false,
  journeyDecisions: true,
  journeyExecution: false,
});

export const channel = (eligible: boolean, reason: string, evaluator = 'consent') => ({
  eligible,
  reason,
  evaluator,
  last_contact_at: null,
  hours_since_last_contact: null,
});

export const contact = (over: Partial<JourneySubjectContext['contact']['channels']> = {}): JourneySubjectContext['contact'] => ({
  channels: {
    email: channel(true, 'express_consent'),
    sms: channel(false, 'no_express_consent'),
    voice: channel(false, 'no_express_consent'),
    in_app: channel(true, 'in_app_needs_no_consent', 'none'),
    none: channel(true, 'no channel needed', 'none'),
    ...over,
  },
  recent_contact_count: 0,
  hours_since_last_contact: null,
  human_conversation: 'unknown',
  human_conversation_reason: 'no source in this codebase',
  sales_capacity: 'unknown',
  sales_capacity_reason: 'no source in this codebase',
  failed_closed: false,
});

export const NO_STOPS = {
  converted: false,
  unsubscribed: false,
  dnc: false,
  consentRevoked: false,
  killSwitch: false,
  campaignInactive: false,
};

/** A real-shaped profile: an ACTIVATING learner who engaged twelve days ago. */
export const facts = (over: Partial<LearnerFacts> = {}): LearnerFacts => ({
  enrollment_id: 'enr-1',
  primary_state: 'ACTIVATING',
  overlays: [],
  scores: { e: 18, i: 4, f: 0 },
  affinities: [{ tag: 'python', confidence: 0.5 }],
  // The two readout fields Explorer's generators actually read; the rest of
  // the readout is Explorer's own shape and irrelevant to this differential.
  readout: { lastEngagementAt: new Date('2026-09-02T12:00:00Z'), recentIntentTier: 0 } as unknown as LearnerFacts['readout'],
  state_entered_at: new Date('2026-08-20T00:00:00Z'),
  ...over,
});

export const TRAINING = { brand_id: 'b-trn', brand_slug: 'colaberry-training', program_id: 'p-trn', program_slug: 'learner', tenant_id: 't-col' };
export const CPN = { brand_id: 'b-cpn', brand_slug: 'cpn', program_id: 'p-cpn', program_slug: 'learner', tenant_id: 't-cpn' };

export const ctx = (over: Partial<JourneySubjectContext> = {}): JourneySubjectContext => ({
  ...TRAINING,
  program_status: 'draft',
  program_kind: 'learner',
  subject_ref: 'enrollment:enr-1',
  lead_id: 77,
  enrollment_id: 'enr-1',
  classification: {
    classification_id: 'c-1',
    brand_relationship: 'colaberry-training',
    primary_path: 'learner_free_training',
    secondary_paths: [],
    intent: 'learn_python',
    requires_human_review: false,
    source_step: 3,
  },
  state: 'ACTIVATING',
  state_entered_at: new Date('2026-08-20T00:00:00Z'),
  overlays: [],
  scores: scoreSubject({ lead: {}, computed_at: null } as unknown as Parameters<typeof scoreSubject>[0], 'learner'),
  contact: contact(),
  hardStop: { ...NO_STOPS },
  freshness: { created_at: new Date('2026-08-01T00:00:00Z'), scores_computed_at: new Date('2026-09-14T06:00:00Z') },
  asOf: AS_OF,
  learner: facts(),
  ...over,
});

/** A CPN scholarship lead: a real subject with nothing in Explorer. */
export const cpn = (over: Partial<JourneySubjectContext> = {}): JourneySubjectContext =>
  ctx({
    ...CPN,
    subject_ref: 'lead:901',
    lead_id: 901,
    enrollment_id: null,
    classification: {
      classification_id: 'c-9',
      brand_relationship: 'cpn',
      primary_path: 'learner_free_training',
      secondary_paths: [],
      intent: 'scholarship_inquiry',
      requires_human_review: false,
      source_step: 2,
    },
    state: 'NEW_EXPLORER',
    learner: null,
    ...over,
  });

export const deps = (): DecideDeps => ({
  assertOfferAllowed: async () => ({ decision: 'allow' }),
  contactPolicyFor: (c, s) => {
    const ch = c.channel === 'none' ? null : s.contact.channels[c.channel];
    return {
      channelEligible: ch?.eligible === true,
      channelReason: ch?.reason,
      consent: { verdict: ch?.eligible ? 'allow' : 'block', reason: ch?.reason ?? 'none', hasRecord: true },
      recentContactCount: 0,
      hoursSinceLastContact: null,
    };
  },
  resolveContent: async () => ({ assets: [{ id: 'asset-1' }], gaps: [] }),
});
