import { Op } from 'sequelize';
import { Appointment, DeliveryEngagement, InteractionOutcome, Lead } from '../../../models';

/**
 * The counted rows the two business lifecycles read (T307 §5.3, T308 §5.4),
 * loaded once for a decision (T311).
 *
 * T307 and T308 declared these sources — `interaction_outcomes.outcome` keyed
 * on `lead_id`, `appointments.status`, `delivery_engagements.source_lead_id` —
 * and tested their classifiers on counts typed by hand. This is the first
 * production reader of those tables for a journey decision, and it reads them
 * exactly as declared: counts by the vocabulary each table already has. No
 * status is invented and no row is written.
 *
 * `isCustomer` is "an enrolment exists" — the subject resolves to an
 * `enrollments` row — which is what T307 meant by "an enrolment or payment".
 * No lead-keyed payment table was found in this run's discovery; `pipeline_stage
 * = enrolled` is read by the lifecycle itself as the other signal. Stated so it
 * can be widened when a payment source exists.
 */

export interface LifecycleSourceCounts {
  inbound: { replied: number; booked_meeting: number; answered: number; declined: number };
  appointments: { scheduled: number; completed: number; no_show: number; cancelled: number };
  hasDeliveryEngagement: boolean;
}

/** The lead columns the lifecycles and T306's scorer read, as signals. */
export type LeadSignalColumns = Pick<
  Lead,
  | 'pipeline_stage'
  | 'idea_input'
  | 'selected_systems'
  | 'industry'
  | 'annual_revenue'
  | 'employee_count'
  | 'company_size'
  | 'technology_stack'
  | 'evaluating_90_days'
  | 'maturity_score'
  | 'estimated_roi'
  | 'departments_impacted'
  | 'lead_temperature'
  | 'email'
  | 'phone'
  | 'created_at'
>;

const NO_INBOUND = { replied: 0, booked_meeting: 0, answered: 0, declined: 0 };
const NO_APPOINTMENTS = { scheduled: 0, completed: 0, no_show: 0, cancelled: 0 };

/** Counts for a lead, or the empty counts for a subject with no lead. */
export async function loadLifecycleSourceCounts(leadId: number | null): Promise<LifecycleSourceCounts> {
  if (leadId === null) return { inbound: { ...NO_INBOUND }, appointments: { ...NO_APPOINTMENTS }, hasDeliveryEngagement: false };

  const [outcomes, appts, engagement] = await Promise.all([
    InteractionOutcome.findAll({ where: { lead_id: leadId }, attributes: ['outcome'] }),
    Appointment.findAll({ where: { lead_id: leadId }, attributes: ['status'] }),
    DeliveryEngagement.count({ where: { source_lead_id: leadId, status: { [Op.ne]: 'cancelled' } } }),
  ]);

  const inbound = { ...NO_INBOUND };
  for (const row of outcomes) {
    const o = String(row.get('outcome'));
    if (o in inbound) inbound[o as keyof typeof inbound] += 1;
  }
  const appointments = { ...NO_APPOINTMENTS };
  for (const row of appts) {
    const s = String(row.get('status'));
    if (s in appointments) appointments[s as keyof typeof appointments] += 1;
  }
  return { inbound, appointments, hasDeliveryEngagement: engagement > 0 };
}
