import { Op } from 'sequelize';
import { Activity, Appointment, Brand, DeliveryEngagement, Enrollment, InteractionOutcome, StrategyCall, Subscription } from '../../../models';
import type { GrowthJourneyOutcomeSource, GrowthJourneyOutcomeType } from '../../../models/GrowthJourneyOutcome';
import { classifyError } from '../../../utils/errorClassifier';
import { redactForLogs } from '../../../utils/piiRedaction';
import { resolveSubject } from '../subjectResolver';
import { recordOutcome } from './outcomeRecorder';

/**
 * The outcome normaliser (Phase 4 T409): the records that already exist,
 * indexed once each onto `growth_journey_outcomes` through T401's recorder.
 *
 * ─── READ-ONLY OVER THE SOURCES, APPEND-ONLY INTO THE INDEX ─────────────────
 *
 * Nothing here changes a source row. Each source is read by the lead it is
 * keyed on and mapped by a fixed table below - a status the table does not
 * name is COUNTED as unmapped, never guessed at. The recorder's unique index
 * on `(source, source_ref)` is what makes normalising the same lead twice one
 * row per fact: the second run replays.
 *
 * The refs follow the conventions the other writers already use, so the same
 * fact reached from two directions is one row: a pipeline stage is
 * `leads.pipeline_stage` / `<lead_id>:<stage>` (T406's advance writes the same),
 * an engagement is `delivery_engagements` / `<engagement_id>` (T406's intake
 * likewise). Every other source's ref is the source row's own id.
 *
 * Each source runs in its own try/catch: one table unavailable is one entry in
 * `failed`, and the others still index.
 */

export const INTERACTION_OUTCOME_MAP: Readonly<Record<string, GrowthJourneyOutcomeType>> = Object.freeze({
  replied: 'reply',
  answered: 'reply',
  booked_meeting: 'meeting_booked',
  declined: 'declined',
});

export const APPOINTMENT_STATUS_MAP: Readonly<Record<string, GrowthJourneyOutcomeType>> = Object.freeze({
  scheduled: 'meeting_booked',
  completed: 'meeting_completed',
  no_show: 'meeting_no_show',
});

export const STRATEGY_CALL_STATUS_MAP: Readonly<Record<string, GrowthJourneyOutcomeType>> = APPOINTMENT_STATUS_MAP;

export interface NormalizeArgs {
  leadId: number;
  brandId: string;
}

export interface NormalizeResult {
  status: 'normalized' | 'no_brand';
  created: number;
  replayed: number;
  /** A status the mapping table does not name: counted by source, never guessed at. Ids and literals only. */
  unmapped: Array<{ source: GrowthJourneyOutcomeSource; source_ref: string; literal: string }>;
  failed: Array<{ source: GrowthJourneyOutcomeSource; error_class: string }>;
  by_type: Partial<Record<GrowthJourneyOutcomeType, number>>;
}

type Candidate = {
  outcome_type: GrowthJourneyOutcomeType;
  source: GrowthJourneyOutcomeSource;
  source_ref: string;
  occurred_at: Date;
  metadata?: Record<string, unknown> | null;
};

const asDate = (v: unknown, fallback: Date): Date => {
  const d = v instanceof Date ? v : typeof v === 'string' || typeof v === 'number' ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : fallback;
};

/** A booking happened when it was made; a held or missed meeting happened when it was scheduled for. */
function meetingOccurredAt(type: GrowthJourneyOutcomeType, row: { get(k: string): unknown }): Date {
  const created = asDate(row.get('created_at'), new Date(0));
  return type === 'meeting_booked' ? created : asDate(row.get('scheduled_at'), created);
}

function log(event: string, fields: Record<string, unknown>): void {
  console.warn(redactForLogs(JSON.stringify({ service: 'growth-journey', level: 'warn', outcome: 'failure', event, ...fields })));
}

/* ── one reader per source ─────────────────────────────────────────────────── */

async function fromInteractionOutcomes(leadId: number, r: NormalizeResult): Promise<Candidate[]> {
  const rows = await InteractionOutcome.findAll({ where: { lead_id: leadId }, attributes: ['id', 'outcome', 'channel', 'created_at'] });
  const out: Candidate[] = [];
  for (const row of rows) {
    const literal = String(row.get('outcome'));
    const type = INTERACTION_OUTCOME_MAP[literal];
    const source_ref = String(row.get('id'));
    if (!type) {
      r.unmapped.push({ source: 'interaction_outcomes', source_ref, literal });
      continue;
    }
    out.push({ outcome_type: type, source: 'interaction_outcomes', source_ref, occurred_at: asDate(row.get('created_at'), new Date(0)), metadata: { outcome: literal, channel: row.get('channel') ?? null } });
  }
  return out;
}

async function fromAppointments(leadId: number, r: NormalizeResult): Promise<Candidate[]> {
  const rows = await Appointment.findAll({ where: { lead_id: leadId }, attributes: ['id', 'status', 'scheduled_at', 'created_at'] });
  const out: Candidate[] = [];
  for (const row of rows) {
    const literal = String(row.get('status'));
    const type = APPOINTMENT_STATUS_MAP[literal];
    const source_ref = String(row.get('id'));
    if (!type) {
      r.unmapped.push({ source: 'appointments', source_ref, literal });
      continue;
    }
    out.push({ outcome_type: type, source: 'appointments', source_ref, occurred_at: meetingOccurredAt(type, row), metadata: { status: literal } });
  }
  return out;
}

async function fromStrategyCalls(leadId: number, r: NormalizeResult): Promise<Candidate[]> {
  const rows = await StrategyCall.findAll({ where: { lead_id: leadId }, attributes: ['id', 'status', 'scheduled_at', 'created_at'] });
  const out: Candidate[] = [];
  for (const row of rows) {
    const literal = String(row.get('status'));
    const type = STRATEGY_CALL_STATUS_MAP[literal];
    const source_ref = String(row.get('id'));
    if (!type) {
      r.unmapped.push({ source: 'strategy_calls', source_ref, literal });
      continue;
    }
    out.push({ outcome_type: type, source: 'strategy_calls', source_ref, occurred_at: meetingOccurredAt(type, row), metadata: { status: literal } });
  }
  return out;
}

/** `pipeline_stage` history: every `status_change` activity, keyed on the stage it moved TO (both writers' metadata shapes). */
async function fromPipelineHistory(leadId: number, r: NormalizeResult): Promise<Candidate[]> {
  const rows = await Activity.findAll({ where: { lead_id: leadId, type: 'status_change' }, attributes: ['id', 'metadata', 'created_at'], order: [['created_at', 'ASC']] });
  const out: Candidate[] = [];
  for (const row of rows) {
    const meta = (row.get('metadata') ?? {}) as Record<string, unknown>;
    const stage = typeof meta.to_stage === 'string' ? meta.to_stage : typeof meta.to === 'string' ? meta.to : null;
    if (!stage) {
      r.unmapped.push({ source: 'leads.pipeline_stage', source_ref: String(row.get('id')), literal: 'status_change_without_stage' });
      continue;
    }
    out.push({ outcome_type: 'opportunity_stage', source: 'leads.pipeline_stage', source_ref: `${leadId}:${stage}`, occurred_at: asDate(row.get('created_at'), new Date(0)), metadata: { stage, from_stage: (meta.from_stage ?? meta.from ?? null) as string | null, activity_id: String(row.get('id')) } });
  }
  return out;
}

async function fromDeliveryEngagements(leadId: number): Promise<Candidate[]> {
  const rows = await DeliveryEngagement.findAll({ where: { source_lead_id: leadId, status: { [Op.ne]: 'cancelled' } }, attributes: ['id', 'status', 'created_at'] });
  return rows.map((row) => ({ outcome_type: 'project_started' as const, source: 'delivery_engagements' as const, source_ref: String(row.get('id')), occurred_at: asDate(row.get('created_at'), new Date(0)), metadata: { status: String(row.get('status')) } }));
}

/**
 * The paid relationship, through the resolver's walk (T407): the enrolment it
 * reaches and that enrolment's active subscriptions. The resolver's `customer`
 * fact is the ONE definition of paid (non-guest + payment_status paid); the
 * enrolment row is read here only for WHEN, never to decide again.
 */
async function fromEnrolment(leadId: number): Promise<Candidate[]> {
  const resolved = await resolveSubject({ leadId });
  if (resolved.status !== 'resolved' || !resolved.subject.enrollment_id) return [];
  const { enrollment_id: enrollmentId, customer } = resolved.subject;
  const out: Candidate[] = [];
  if (customer.paid && customer.basis === 'payment_status') {
    const enrollment = await Enrollment.findByPk(enrollmentId, { attributes: ['id', 'tier', 'created_at'] });
    out.push({ outcome_type: 'enrolled_paid', source: 'enrollments', source_ref: enrollmentId, occurred_at: asDate(enrollment?.created_at, new Date(0)), metadata: { tier: enrollment?.tier ?? null } });
  }
  const subscriptions = await Subscription.findAll({ where: { enrollment_id: enrollmentId, status: 'active' }, attributes: ['id', 'plan', 'started_at', 'created_at'] });
  for (const s of subscriptions) {
    out.push({ outcome_type: 'subscription_active', source: 'subscriptions', source_ref: String(s.id), occurred_at: asDate(s.started_at, asDate(s.created_at, new Date(0))), metadata: { plan: s.plan } });
  }
  return out;
}

/* ── the normaliser ────────────────────────────────────────────────────────── */

const READERS: Array<{ source: GrowthJourneyOutcomeSource; read: (leadId: number, r: NormalizeResult) => Promise<Candidate[]> }> = [
  { source: 'interaction_outcomes', read: fromInteractionOutcomes },
  { source: 'appointments', read: fromAppointments },
  { source: 'strategy_calls', read: fromStrategyCalls },
  { source: 'leads.pipeline_stage', read: fromPipelineHistory },
  { source: 'delivery_engagements', read: (leadId) => fromDeliveryEngagements(leadId) },
  { source: 'enrollments', read: (leadId) => fromEnrolment(leadId) },
];

export async function normalizeExistingOutcomes(args: NormalizeArgs): Promise<NormalizeResult> {
  const result: NormalizeResult = { status: 'normalized', created: 0, replayed: 0, unmapped: [], failed: [], by_type: {} };
  const brand = await Brand.findByPk(args.brandId, { attributes: ['id', 'tenant_id'] });
  if (!brand) return { ...result, status: 'no_brand' };
  const tenant_id = String(brand.tenant_id);
  const subject_ref = `lead:${args.leadId}`;

  for (const reader of READERS) {
    let candidates: Candidate[];
    try {
      candidates = await reader.read(args.leadId, result);
    } catch (err: unknown) {
      const error_class = classifyError(err);
      result.failed.push({ source: reader.source, error_class });
      log('growth_journey.outcome.normalize_source_failed', { source: reader.source, lead_id: args.leadId, brand_id: args.brandId, error_class });
      continue;
    }
    for (const c of candidates) {
      try {
        const written = await recordOutcome({ tenant_id, brand_id: args.brandId, subject_ref, lead_id: args.leadId, outcome_type: c.outcome_type, source: c.source, source_ref: c.source_ref, occurred_at: c.occurred_at, metadata: c.metadata ?? null });
        if (written.replayed) result.replayed += 1;
        else result.created += 1;
        result.by_type[c.outcome_type] = (result.by_type[c.outcome_type] ?? 0) + 1;
      } catch (err: unknown) {
        const error_class = classifyError(err);
        result.failed.push({ source: c.source, error_class });
        log('growth_journey.outcome.normalize_write_failed', { source: c.source, source_ref: c.source_ref, lead_id: args.leadId, brand_id: args.brandId, error_class });
      }
    }
  }
  return result;
}
