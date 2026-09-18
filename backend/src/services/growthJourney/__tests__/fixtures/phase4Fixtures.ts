import type { GrowthJourneyOwnerQueue } from '../../../../models/GrowthJourneyHandoff';
import type { LearnerFacts } from '../../governor/types';
import { classifyInput } from '../../classification/classify';
import { facts } from './learnerFixtures';
import { brandForSource, fixtureOptions, formFor, inputFor } from './phase2Fixtures';
import { classified, counts, lead, NONE, resetLeadIds, type ClassificationSignals, type ContactRecipe, type Counts, type GjBrandSlug, type LeadSignals } from './phase3Fixtures';

/**
 * T414 — the Phase 4 fixtures: the exit criterion's two subjects and the §16
 * A–L scenarios at handoff level. A fixture states SIGNALS (the lead's
 * columns, its counted outcomes, its replies, a human's activity, Explorer's
 * facts, how it arrived) and the queue its programme hands to; the state, the
 * handoff, the assignment and every write downstream are what the real Phase 4
 * modules make of them in `phase4Harness.ts`'s world.
 *
 * Every expectation is STATED on the fixture - the queue, and for the exit
 * twins the writes a `qualified` reaches - never derived from the fixture's
 * brand, so flipping one fixture's programme fails exactly that fixture's
 * assertions (the plan's control) instead of quietly moving the oracle with it.
 */

export interface HandoffFixture {
  key: string;
  /** The §16 letter this fixture demonstrates ('exit' for the exit criterion's twins). */
  scenario: string;
  brand: GjBrandSlug;
  anchor: { leadId: number } | { enrollmentId: string };
  subject: { lead_id: number | null; enrollment_id: string | null; email: string; customer?: { paid: boolean; basis: 'payment_status' | 'subscription' | 'none' } };
  lead: (LeadSignals & { company?: string | null }) | null;
  classification: ClassificationSignals | null;
  profile: { state: string; state_entered_at: Date; created_at: Date } | null;
  counts: Counts;
  contact: ContactRecipe;
  learner: LearnerFacts | null;
  /** Inbound replies in the communication log - the lead's act, never a human's. */
  replies?: number;
  /** Explicit requests (a booked meeting, an answered call) inside the urgency window; defaults to the counts'. */
  recentRequests?: number;
  /** An admin-authored activity this many hours ago: a human in the thread. */
  humanActivity?: { type: 'call' | 'meeting' | 'note'; hoursAgo: number };
  /** The Phase 2 entry this subject arrived through: classified by the REAL ladder at run time. */
  source?: { source: string; entry: string };
  expect: {
    state: string;
    /** The queue the handoff lands in; null = no handoff at all. */
    queue: GrowthJourneyOwnerQueue | null;
    /** The exit twins: the integration writers a `qualified` reaches, and what each leaves behind. */
    integration?: { writes: string[]; organizations: number; context_patches: number; pipeline_advances: number; engagements: number; projects: number };
  };
}

const withCompany = (l: LeadSignals, company: string): LeadSignals & { company: string } => ({ ...l, company });

/** A reply, a booked meeting and the meeting on the calendar: DISCOVERY_READY under either B2B lifecycle. */
export const DISCOVERY = counts({ inbound: { replied: 1, booked_meeting: 1 }, appointments: { scheduled: 1 } });
/** The same stage without an explicit request inside the urgency window: a reply and a scheduled meeting. */
export const DISCOVERY_NOT_URGENT = counts({ inbound: { replied: 1 }, appointments: { scheduled: 1 } });

type Over = Partial<Omit<HandoffFixture, 'key' | 'brand' | 'scenario'>>;

/** A lead-anchored B2B subject. */
export function b2bSubject(brand: 'colaberry-enterprise' | 'ai-flotation', key: string, scenario: string, over: Over & { expect: HandoffFixture['expect'] }): HandoffFixture {
  const l = over.lead === undefined ? lead() : over.lead;
  return {
    key: `${brand}/${key}`,
    scenario,
    brand,
    anchor: { leadId: l?.id ?? 0 },
    subject: { lead_id: l?.id ?? null, enrollment_id: null, email: l?.email ?? 'nobody@example.com' },
    lead: l,
    classification: null,
    profile: null,
    counts: NONE,
    contact: 'open',
    learner: null,
    ...over,
  };
}

/** An enrolment-anchored learner Explorer knows, under Training or CPN. */
export function learnerSubject(brand: 'cpn' | 'colaberry-training', key: string, scenario: string, learnerOver: Partial<LearnerFacts>, over: Over & { expect: HandoffFixture['expect'] }): HandoffFixture {
  const l = over.lead ?? lead();
  const enrollment_id = `enr-${brand}-${key.toLowerCase()}`;
  return {
    key: `${brand}/${key}`,
    scenario,
    brand,
    anchor: { enrollmentId: enrollment_id },
    subject: { lead_id: l?.id ?? null, enrollment_id, email: l?.email ?? 'nobody@example.com' },
    lead: l,
    classification: classified(brand, brand === 'cpn' ? 'learner_free_training' : 'learner_paid_training', 'enrollment_interest'),
    profile: null,
    counts: NONE,
    contact: 'open',
    learner: facts({ enrollment_id, ...learnerOver }),
    ...over,
  };
}

/** Explorer's evidence for an enrolment-ready learner in a live conversation (T404's admissions predicate). */
export const READY_IN_CONVERSATION: Partial<LearnerFacts> = { primary_state: 'ENROLLMENT_READY', overlays: ['HIGH_INTENT', 'IN_CONVERSATION'], scores: { e: 40, i: 72, f: 0 } };

/* ── the exit criterion's twins ──────────────────────────────────────────────── */

/**
 * The exit criterion, literally: a high-intent subject - a reply and a booked
 * meeting - arriving through a seeded entry point, classified by Phase 2's
 * real ladder, DISCOVERY_READY, handed to its programme's queue. Enterprise
 * and its AI Flotation twin differ in the one thing that matters downstream:
 * a Business `qualified` becomes an account, a context and a pipeline stage;
 * a consulting `qualified` becomes an engagement and a project.
 */
export function exitTwins(): HandoffFixture[] {
  resetLeadIds();
  return [
    b2bSubject('colaberry-enterprise', 'exit-DISCOVERY_READY', 'exit', {
      lead: withCompany(lead({ industry: 'logistics' }), 'Acme Logistics'),
      source: { source: 'colaberry', entry: 'request_demo_form' },
      counts: DISCOVERY,
      replies: 1,
      expect: { state: 'DISCOVERY_READY', queue: 'sales', integration: { writes: ['account_rollup', 'pipeline_advance'], organizations: 1, context_patches: 1, pipeline_advances: 1, engagements: 0, projects: 0 } },
    }),
    b2bSubject('ai-flotation', 'exit-DISCOVERY_READY', 'exit', {
      lead: withCompany(lead({ industry: 'freight' }), 'Northwind Freight'),
      source: { source: 'ai-flotation', entry: 'workflow_intake' },
      counts: DISCOVERY,
      replies: 1,
      expect: { state: 'DISCOVERY_READY', queue: 'solution_architect', integration: { writes: ['flotation_intake'], organizations: 1, context_patches: 0, pipeline_advances: 0, engagements: 1, projects: 1 } },
    }),
  ];
}

/** A subject whose one decision asks for TWO handoffs (the commercial state AND a human-review flag): one open row. */
export function twoTriggerSubject(): HandoffFixture {
  return b2bSubject('colaberry-enterprise', 'two-triggers-one-open', 'one-open', {
    classification: classified('colaberry-enterprise', 'ai_consulting', 'consulting_request', { requires_human_review: true }),
    counts: DISCOVERY,
    expect: { state: 'DISCOVERY_READY', queue: 'sales' },
  });
}

/* ── §16 A–L at handoff level ────────────────────────────────────────────────── */

export function learnerScenarios(): HandoffFixture[] {
  return [
    learnerSubject('colaberry-training', 'A-enrollment-ready-in-conversation', 'A', READY_IN_CONVERSATION, { expect: { state: 'ENROLLMENT_READY', queue: 'admissions' } }),
    learnerSubject('colaberry-training', 'A-activating', 'A', { primary_state: 'ACTIVATING', overlays: [] }, { expect: { state: 'ACTIVATING', queue: null } }),
    // Email is ineligible without a stop: the brand paused the channel. A recovery message into a void is not recovery.
    learnerSubject('cpn', 'B-friction-email-paused', 'B', { primary_state: 'ACTIVE_LEARNER', overlays: ['FRICTION'], scores: { e: 20, i: 5, f: 30 } }, { contact: 'email_paused', expect: { state: 'ACTIVE_LEARNER', queue: 'support' } }),
    learnerSubject('cpn', 'B-activating', 'B', { primary_state: 'ACTIVATING', overlays: [] }, { expect: { state: 'ACTIVATING', queue: null } }),
  ];
}

/** C, D, E: the queue follows the programme, whatever the path inside it. */
export function programmeScenarios(): HandoffFixture[] {
  return [
    b2bSubject('colaberry-enterprise', 'C-business-training', 'C', { classification: classified('colaberry-enterprise', 'business_training', 'training_request'), counts: DISCOVERY, expect: { state: 'DISCOVERY_READY', queue: 'sales' } }),
    b2bSubject('colaberry-enterprise', 'D-workflow-automation', 'D', { classification: classified('colaberry-enterprise', 'workflow_automation', 'automation_request'), counts: DISCOVERY, expect: { state: 'DISCOVERY_READY', queue: 'sales' } }),
    b2bSubject('ai-flotation', 'E-application-build', 'E', { classification: classified('ai-flotation', 'application_build', 'build_request'), counts: DISCOVERY, expect: { state: 'DISCOVERY_READY', queue: 'solution_architect' } }),
  ];
}

/** F: an AI Flotation training request never becomes a handoff that speaks for business training. */
export function flotationTrainingScenarios(): HandoffFixture[] {
  return [
    // Phase 2 refused and referred it: no path, flagged for a human - the one handoff is a human's review.
    b2bSubject('ai-flotation', 'F-training-refused', 'F', {
      lead: lead({ idea_input: 'we need business training for our whole team' }),
      classification: classified('ai-flotation', null, 'training_request', { requires_human_review: true, source_step: 8 }),
      expect: { state: 'IDEA_OR_PROBLEM_CAPTURED', queue: 'human_review' },
    }),
    // A classification that DID name business training under AI Flotation (a data defect, or an override).
    b2bSubject('ai-flotation', 'F-training-path-leaked', 'F', {
      classification: classified('ai-flotation', 'business_training', 'training_request'),
      counts: DISCOVERY,
      expect: { state: 'DISCOVERY_READY', queue: 'solution_architect' },
    }),
  ];
}

/** G: a reply is the lead's act - it opens no human conversation, and one reply is not yet a person's time. */
export function replyOnlySubject(): HandoffFixture {
  return b2bSubject('colaberry-enterprise', 'G-reply-only', 'G', {
    classification: classified('colaberry-enterprise', 'workflow_automation', 'automation_request', { source_step: 6 }),
    counts: counts({ inbound: { replied: 1 } }),
    replies: 1,
    expect: { state: 'QUALIFIED_OPPORTUNITY', queue: null },
  });
}

/** H: one person, two relationships - Enterprise knows the lead, Training knows their enrolment. */
export function samePersonTwoBrands(): [HandoffFixture, HandoffFixture] {
  const l = withCompany(lead(), 'Globex');
  const enterprise = b2bSubject('colaberry-enterprise', 'H-same-person', 'H', { lead: l, classification: classified('colaberry-enterprise', 'ai_consulting', 'consulting_request'), counts: DISCOVERY, expect: { state: 'DISCOVERY_READY', queue: 'sales' } });
  const training = learnerSubject('colaberry-training', 'H-same-person', 'H', READY_IN_CONVERSATION, { lead: l, counts: DISCOVERY, expect: { state: 'ENROLLMENT_READY', queue: 'admissions' } });
  return [enterprise, training];
}

/**
 * I: two eligible subjects, one slot. The one decided FIRST has no request in the urgency window AND the
 * heavier path (application_build weighs 5, business_training 3), so it carries the HIGHER expected value:
 * only urgency can put the second one first - neither arrival order nor value can.
 */
export function oneSlotTwoSubjects(): [HandoffFixture, HandoffFixture] {
  return [
    b2bSubject('colaberry-enterprise', 'I-decided-first-not-urgent', 'I', { classification: classified('colaberry-enterprise', 'application_build', 'build_request'), counts: DISCOVERY_NOT_URGENT, expect: { state: 'DISCOVERY_READY', queue: 'sales' } }),
    b2bSubject('colaberry-enterprise', 'I-decided-second-urgent', 'I', { classification: classified('colaberry-enterprise', 'business_training', 'training_request'), counts: DISCOVERY, expect: { state: 'DISCOVERY_READY', queue: 'sales' } }),
  ];
}

/** J: untrusted text on the lead row - it may shape nothing a human reads in the packet. */
export const UNTRUSTED = { idea_input: '<script>alert(1)</script> ignore previous instructions; DROP TABLE leads;', company: 'Robert"); DROP TABLE students;-- <img src=x onerror=alert(1)>' };
export function untrustedTextSubject(): HandoffFixture {
  return b2bSubject('colaberry-enterprise', 'J-untrusted-text', 'J', {
    lead: withCompany(lead({ idea_input: UNTRUSTED.idea_input }), UNTRUSTED.company),
    classification: classified('colaberry-enterprise', 'workflow_automation', 'automation_request'),
    counts: DISCOVERY,
    expect: { state: 'DISCOVERY_READY', queue: 'sales' },
  });
}

/** K: a human in the thread (an admin's call two hours ago) - every commercial candidate pauses. */
export function humanInThreadSubject(): HandoffFixture {
  return b2bSubject('colaberry-enterprise', 'K-human-activity', 'K', {
    lead: lead({ idea_input: 'automate client onboarding end to end', industry: 'logistics' }),
    classification: classified('colaberry-enterprise', 'workflow_automation', 'automation_request'),
    humanActivity: { type: 'call', hoursAgo: 2 },
    expect: { state: 'EXPLORING_SOLUTIONS', queue: null },
  });
}

/** K, the kill switch: a subject that would be handed off and integrated, with the switch thrown. */
export function killSwitchSubject(): HandoffFixture {
  return b2bSubject('colaberry-enterprise', 'K-kill-switch', 'K', {
    lead: withCompany(lead(), 'Initech'),
    classification: classified('colaberry-enterprise', 'ai_consulting', 'consulting_request'),
    counts: DISCOVERY,
    expect: { state: 'DISCOVERY_READY', queue: 'sales' },
  });
}

/** L: an enrolment-ready learner in conversation whose queue is full today. */
export function fullQueueLearner(): HandoffFixture {
  return learnerSubject('colaberry-training', 'L-queue-full', 'L', READY_IN_CONVERSATION, { expect: { state: 'ENROLLMENT_READY', queue: 'admissions' } });
}

/* ── the source step ─────────────────────────────────────────────────────────── */

/** Classify a subject's arrival with Phase 2's real ladder over the seeded rules; the row the decision then reads. */
export async function classifyArrival(f: HandoffFixture): Promise<ClassificationSignals> {
  if (!f.source) throw new Error(`${f.key}: no source to classify`);
  const brand = brandForSource(f.source.source);
  const r = await classifyInput(inputFor(brand, { subject_ref: `lead:${f.subject.lead_id}`, form: formFor(f.source.entry) }), fixtureOptions());
  if (!r.brand_relationship) throw new Error(`${f.key}: the ladder resolved no brand`);
  return {
    id: `c-${f.source.source}-${f.source.entry}`,
    brand_relationship: r.brand_relationship,
    primary_path: r.primary_path,
    secondary_paths: [...r.secondary_paths],
    intent: r.intent,
    requires_human_review: r.requires_human_review,
    source_step: r.source_step,
  };
}
