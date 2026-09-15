import { scoreSubject } from '../../scoring/scoreVector';
import type { JourneySubjectContext } from '../../governor/types';
import { AS_OF, contact, NO_STOPS } from './learnerFixtures';

/**
 * Shared fixtures for the T310 suites: a Colaberry Enterprise lead and an AI
 * Flotation lead, each in a state the generators read, with T306's real score
 * vector for the programme (mostly gaps, which is the honest state) and T304's
 * contact shape.
 */

const classification = (over: Partial<NonNullable<JourneySubjectContext['classification']>> = {}) => ({
  classification_id: 'c-b1',
  brand_relationship: 'colaberry-enterprise',
  primary_path: 'workflow_automation',
  secondary_paths: [],
  intent: 'automation_request',
  requires_human_review: false,
  source_step: 3,
  ...over,
});

const base = (over: Partial<JourneySubjectContext> = {}): JourneySubjectContext => ({
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
  classification: classification(),
  // A context T307 actually produces: a path is known (so EXPLORING_SOLUTIONS,
  // not PROBLEM_IDENTIFIED, which never carries one) and the lead has never
  // replied, which is NO_RESPONSE by construction.
  state: 'EXPLORING_SOLUTIONS',
  state_entered_at: new Date('2026-09-01T00:00:00Z'),
  overlays: ['NO_RESPONSE'],
  scores: scoreSubject({ lead: { industry: 'logistics' }, computed_at: AS_OF } as unknown as Parameters<typeof scoreSubject>[0], 'business'),
  contact: contact(),
  hardStop: { ...NO_STOPS },
  freshness: { created_at: new Date('2026-08-01T00:00:00Z'), scores_computed_at: new Date('2026-09-14T06:00:00Z') },
  asOf: AS_OF,
  learner: null,
  ...over,
});

/** A Colaberry Enterprise lead exploring a known path, who has never replied. */
export const bizCtx = (over: Partial<JourneySubjectContext> = {}): JourneySubjectContext => base(over);

/** An AI Flotation lead who has captured an idea. */
export const flotCtx = (over: Partial<JourneySubjectContext> = {}): JourneySubjectContext =>
  base({
    tenant_id: 't-flot',
    brand_id: 'b-flot',
    brand_slug: 'ai-flotation',
    program_id: 'p-flot',
    program_slug: 'service-growth',
    program_kind: 'consulting',
    subject_ref: 'lead:701',
    lead_id: 701,
    classification: classification({ brand_relationship: 'ai-flotation', primary_path: 'application_build', intent: 'build_request' }),
    // Flotation's problem-known state CAN carry a path (a path does not move
    // its ladder; intent plus named systems does), so education is real here.
    state: 'IDEA_OR_PROBLEM_CAPTURED',
    scores: scoreSubject({ lead: {}, computed_at: AS_OF } as unknown as Parameters<typeof scoreSubject>[0], 'consulting'),
    ...over,
  });

export const withClassification = classification;
