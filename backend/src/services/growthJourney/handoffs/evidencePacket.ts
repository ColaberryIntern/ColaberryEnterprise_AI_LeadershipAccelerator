import type { GrowthJourneyHandoffPriority } from '../../../models/GrowthJourneyHandoff';
import { AddressInPayloadError, findAddressLikeValue } from '../noAddress';
import type { DecisionRowView, HandoffTrigger, StoredSignals, SubjectRefs } from './types';

/**
 * The §9 evidence packet — what a human reads before touching a person
 * (Phase 4 T404). PURE: built from rows the writer already loaded, never by
 * re-running the pipeline, and never carrying an address, a message body or
 * a transcript. `assertPacketCarriesNoAddress` is the contract's standing
 * check applied at the writer.
 *
 * Every §9 field is present, or explicitly `{ available: false, reason }`:
 * a packet that omits a field silently is the thing a reviewer cannot tell
 * from a packet that answered it.
 */

export interface Unavailable {
  available: false;
  reason: string;
}

const unavailable = (reason: string): Unavailable => ({ available: false, reason });

/** Likely need and talking points per offer family — a fixed table, no model. */
const NEED_BY_FAMILY: Readonly<Record<string, { likely_need: string; talking_points: string[] }>> = Object.freeze({
  business_training: { likely_need: 'a team that can use AI in its own work', talking_points: ['which roles and how many', 'a first cohort date they can hold', 'what "done" looks like for the team'] },
  ai_consulting: { likely_need: 'a decision on where AI pays off first', talking_points: ['the one process that hurts most today', 'who owns the outcome', 'a scoped first engagement'] },
  workflow_automation: { likely_need: 'a manual workflow taken off a team', talking_points: ['the workflow, end to end, in their words', 'volume per week and who touches it', 'systems it reads and writes'] },
  application_build: { likely_need: 'a working application, scoped and built', talking_points: ['the user and the first screen', 'data it must own', 'a build-then-run ownership plan'] },
  ai_project: { likely_need: 'a bounded AI project with a visible result', talking_points: ['the result they will show internally', 'inputs available today', 'the next step if it works'] },
  paid_discovery: { likely_need: 'a paid discovery to size the real problem', talking_points: ['what discovery must answer', 'who joins the sessions', 'the decision it leads to'] },
  learner_free_training: { likely_need: 'a first lesson they can finish this week', talking_points: ['what they came to learn', 'time they can give per week', 'the next lesson'] },
  learner_paid_training: { likely_need: 'a paid programme decision', talking_points: ['the outcome they want', 'schedule and payment options', 'the first-day plan'] },
  learner_community_subscription: { likely_need: 'a reason to stay in the community', talking_points: ['what they engaged with', 'a member to connect them with', 'the next session'] },
  learner_certification: { likely_need: 'certification readiness', talking_points: ['exam date and readiness', 'weak domains', 'a study plan'] },
  learner_internship: { likely_need: 'an internship placement path', talking_points: ['portfolio state', 'availability', 'target roles'] },
});

/** Every disposition a human may record, and what each means for the AI. */
export const DISPOSITION_OPTIONS = Object.freeze([
  { value: 'qualified', means: 'a human continues; the AI pauses' },
  { value: 'not_ready', means: 'back to the AI journey with a cooldown' },
  { value: 'nurture', means: 'back to the AI journey, nurture only' },
  { value: 'no_contact', means: 'do not contact; recorded as an outcome' },
  { value: 'disqualified', means: 'closed; recorded as an outcome' },
  { value: 'converted', means: 'closed won; recorded as an outcome' },
]);

export interface BuildPacketArgs {
  trigger: HandoffTrigger;
  refs: SubjectRefs;
  decision: DecisionRowView | null;
  signals: StoredSignals;
  urgent: boolean;
  expected_value: { value: number; components: Record<string, number>; formula: string };
  priority: GrowthJourneyHandoffPriority;
  sla_due_at: Date | null;
  built_at: Date;
}

export type EvidencePacket = Record<string, unknown>;

function scoresSection(decision: DecisionRowView | null): unknown {
  if (!decision) return unavailable('no_decision');
  const s = decision.scores;
  if (!s) return unavailable('no_scores_on_decision');
  const dims = Array.isArray(s.dimensions) ? (s.dimensions as Record<string, unknown>[]) : [];
  return {
    summary: typeof s.summary === 'number' ? s.summary : null,
    available: s.available ?? null,
    computed_at: s.computed_at ?? null,
    components: dims.map((d) => ({ key: d.key ?? null, value: typeof d.value === 'number' ? d.value : null, gap: d.gap ?? null })),
    gaps: decision.score_gaps,
  };
}

function consentSection(decision: DecisionRowView | null): Record<string, unknown> {
  const ce = decision?.contact_evidence;
  const channels = ce && typeof ce === 'object' ? (ce as { channels?: Record<string, { eligible?: boolean; reason?: string; evaluator?: string }> }).channels : undefined;
  if (!channels) return { consent: unavailable(decision ? 'no_contact_evidence_on_decision' : 'no_decision'), best_permitted_channel: null };
  const order = ['email', 'sms', 'voice', 'in_app'];
  const best = order.find((c) => channels[c]?.eligible === true) ?? null;
  const consent = Object.fromEntries(order.filter((c) => c in channels).map((c) => [c, { eligible: channels[c].eligible === true, reason: channels[c].reason ?? null, evaluator: channels[c].evaluator ?? null }]));
  return { consent, best_permitted_channel: best };
}

function qualificationGaps(decision: DecisionRowView | null, signals: StoredSignals, refs: SubjectRefs): string[] {
  const gaps: string[] = [...(decision?.score_gaps ?? [])];
  // Said, never shown as the path: the classification asked for a family this brand does not offer.
  if (refs.path_refused) gaps.push(`path_not_offered_by_brand:${refs.path_refused}`);
  const lead = signals.lead;
  if (!lead) gaps.push('no_lead_row');
  else {
    if (!lead.industry) gaps.push('firmographic:industry');
    if (lead.employee_count === null || lead.employee_count === undefined) gaps.push('firmographic:employee_count');
    if (lead.annual_revenue === null || lead.annual_revenue === undefined) gaps.push('firmographic:annual_revenue');
    if (!lead.has_company) gaps.push('firmographic:company');
  }
  if (!decision) gaps.push('no_decision');
  return gaps;
}

export function buildEvidencePacket(a: BuildPacketArgs): EvidencePacket {
  const { refs, decision, signals, trigger } = a;
  const need = refs.path ? NEED_BY_FAMILY[refs.path] ?? null : null;
  const packet: EvidencePacket = {
    version: 1,
    built_at: a.built_at.toISOString(),
    person: { subject_ref: refs.subject_ref, lead_id: refs.lead_id, enrollment_id: refs.enrollment_id },
    account: signals.context?.organization_id ? { organization_id: signals.context.organization_id } : unavailable('no_organization_linked'),
    brand_program_path: { brand_id: refs.brand_id, brand_slug: refs.brand_slug, program: refs.program, path: refs.path },
    origin: signals.context
      ? { first_source_id: signals.context.first_source_id, first_entry_point_id: signals.context.first_entry_point_id, first_campaign_id: signals.context.first_campaign_id, first_touch_at: signals.context.first_touch_at?.toISOString() ?? null }
      : unavailable('no_lead_tenant_context'),
    escalation_reason: { source: trigger.source, reason: trigger.reason, decision_id: decision?.id ?? null, decision_reason: decision?.reason ?? null },
    signals: decision
      ? { state_at_decision: decision.state_at_decision, overlays: decision.overlays_at_decision, scores: scoresSection(decision), human_conversation: decision.human_conversation, sales_capacity: decision.sales_capacity, pipeline_stage: signals.lead?.pipeline_stage ?? null }
      : { state_at_decision: null, overlays: [], scores: unavailable('no_decision'), human_conversation: null, sales_capacity: null, pipeline_stage: signals.lead?.pipeline_stage ?? null },
    contact_history: {
      by_channel: signals.contacts.by_channel,
      total_outbound: signals.contacts.total_outbound,
      total_inbound: signals.contacts.total_inbound,
      outcomes: signals.counts ? { inbound: signals.counts.inbound, appointments: signals.counts.appointments, has_delivery_engagement: signals.counts.hasDeliveryEngagement } : unavailable('counts_not_loaded'),
    },
    transcript: unavailable('permission_has_no_source'),
    qualification_gaps: qualificationGaps(decision, signals, refs),
    likely_need: need ? need.likely_need : unavailable(refs.path ? `no_table_entry:${refs.path}` : 'no_path'),
    talking_points: need ? need.talking_points : [],
    ...consentSection(decision),
    owner_queue: trigger.owner_queue,
    sla: a.sla_due_at ? { hours: signals.sla_hours, due_at: a.sla_due_at.toISOString() } : unavailable('no_sla_policy'),
    priority: a.priority,
    urgent: { value: a.urgent, reasons: signals.explicit_request.reasons },
    expected_value: a.expected_value,
    links: {
      person: `/admin/people/${refs.subject_ref}`,
      decision_id: decision?.id ?? null,
      organization_id: signals.context?.organization_id ?? null,
    },
    disposition_options: DISPOSITION_OPTIONS,
    return_to_ai: { action: 'disposition:not_ready|nurture', effect: 'the subject returns to the AI journey with a cooldown the strategies honour' },
  };
  return packet;
}

/** The standing check: a packet with an `@` anywhere in a string value is refused before it is written. */
export function assertPacketCarriesNoAddress(packet: EvidencePacket): void {
  const hit = findAddressLikeValue(packet, 'evidence');
  if (hit) throw new AddressInPayloadError(hit, 'handoff evidence packet');
}

/** The §9 headings, so a test can assert every one is present on every packet. */
export const PACKET_FIELDS = Object.freeze([
  'person', 'account', 'brand_program_path', 'origin', 'escalation_reason', 'signals', 'contact_history', 'transcript',
  'qualification_gaps', 'likely_need', 'talking_points', 'consent', 'best_permitted_channel', 'owner_queue', 'sla',
  'priority', 'urgent', 'expected_value', 'links', 'disposition_options', 'return_to_ai',
]);
