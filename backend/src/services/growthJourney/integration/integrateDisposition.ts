import { Lead } from '../../../models';
import { recordJourneyEvent } from '../ledger';
import { recordOutcome } from '../outcomes/outcomeRecorder';
import { rollUpAccount } from './accountRollup';
import { isIntegratingDisposition, type IntegratingDisposition } from './dispositions';
import { intakeFlotationClient } from './flotationIntake';
import { advanceForDisposition } from './pipelineAdvance';

/**
 * Existing-system integration on a human disposition (Phase 4 T406).
 *
 * The ONLY entry point from the handoff machine into the three writers, and
 * the only place that decides which of them a verdict reaches:
 *
 *   Business subject     qualified  → the account roll-up, then the pipeline advance (meeting_scheduled)
 *                        converted  → the pipeline advance only (proposal_sent)
 *   AI Flotation subject qualified | converted → the Flotation intake (the existing conversion)
 *   Learner subject      nothing: their systems are Explorer's (stated on the ledger row)
 *
 * Every writer checks the kill switch itself and refuses by name; a refusal
 * never fails the disposition - it is recorded on the handoff
 * (`integration_refused`) and on the ledger. Every write is an `event_ledger`
 * row (`growth_journey.integration.<writer>`, ids only) and, where a fact
 * changed, a `growth_journey_outcomes` row through T401's recorder:
 * `opportunity_stage` for a stage that moved (source `leads.pipeline_stage`,
 * ref `<lead_id>:<stage>` - the convention T409's normaliser reuses so the
 * same stage indexed twice is one outcome), `project_started` for a conversion
 * (source `delivery_engagements`, ref the engagement id).
 *
 * The writers are idempotent on what already exists; this file is idempotent
 * because they are. A stage the lead already holds is `not_advanced` and gets
 * no outcome. Nothing here sends or notifies; the AI decided nothing here.
 */

export type IntegrationStatus = 'skipped' | 'refused' | 'written';

export interface IntegrationSummary {
  status: IntegrationStatus;
  /** The skip reason, or the first refusal's reason; null when something was written. */
  reason: string | null;
  program_kind: string | null;
  disposition: string;
  /** The writers that ran to a write, in order. */
  writes: string[];
  refusals: Array<{ writer: string; reason: string }>;
  outcome_ids: string[];
  /** Ids only - organisation, context, stage, engagement, project. */
  ids: Record<string, string | number | boolean | null>;
}

export interface HandoffForIntegration {
  id: string;
  tenant_id: string;
  brand_id: string;
  subject_ref: string;
  lead_id: number | null;
  decision_id: string | null;
  evidence: Record<string, unknown>;
}

export interface IntegrationActor {
  id: string;
  platformIdentityId?: string | null;
}

export interface IntegrateDispositionArgs {
  handoff: HandoffForIntegration;
  disposition: string;
  actor: IntegrationActor;
  asOf: Date;
}

const ENTITY = 'growth_journey_handoff';
const EVENT = 'growth_journey.integration';

/** The programme kind the T404 packet recorded for the subject; null when the packet has none. */
export function programKindOf(evidence: Record<string, unknown>): string | null {
  const kind = (evidence as { brand_program_path?: { program?: { kind?: unknown } | null } })?.brand_program_path?.program?.kind;
  return typeof kind === 'string' && kind ? kind : null;
}

function summary(disposition: string, program_kind: string | null): IntegrationSummary {
  return { status: 'skipped', reason: null, program_kind, disposition, writes: [], refusals: [], outcome_ids: [], ids: {} };
}

async function ledger(h: HandoffForIntegration, actor: IntegrationActor, event: string, payload: Record<string, unknown>): Promise<void> {
  await recordJourneyEvent(`${EVENT}.${event}`, ENTITY, h.id, { tenant_id: h.tenant_id, brand_id: h.brand_id }, { handoff_id: h.id, subject_ref: h.subject_ref, lead_id: h.lead_id, ...payload }, `admin:${actor.id}`);
}

async function refuse(s: IntegrationSummary, h: HandoffForIntegration, actor: IntegrationActor, writer: string, reason: string): Promise<IntegrationSummary> {
  s.refusals.push({ writer, reason });
  if (s.status !== 'written') {
    s.status = 'refused';
    s.reason = s.reason ?? reason;
  }
  await ledger(h, actor, 'refused', { writer, reason, disposition: s.disposition });
  return s;
}

export async function integrateDisposition(args: IntegrateDispositionArgs): Promise<IntegrationSummary> {
  const { handoff: h, actor, asOf } = args;
  const kind = programKindOf(h.evidence);
  const s = summary(args.disposition, kind);

  if (!isIntegratingDisposition(args.disposition)) return skip(s, `disposition_${args.disposition}`);
  if (kind === 'learner') return skip(s, 'learner_program');
  if (kind !== 'business' && kind !== 'consulting') return skip(s, 'program_kind_unknown');
  if (h.lead_id === null) return skip(s, 'no_lead_anchor');
  const disposition: IntegratingDisposition = args.disposition;
  const leadId = h.lead_id;

  if (kind === 'consulting') {
    const r = await intakeFlotationClient({ leadId, tenantId: h.tenant_id, brandId: h.brand_id, actorIdentityId: actor.platformIdentityId ?? null, handoffId: h.id });
    if (r.status === 'refused') return refuse(s, h, actor, 'flotation_intake', r.reason);
    s.status = 'written';
    s.writes.push('flotation_intake');
    Object.assign(s.ids, { organization_id: r.organization_id, engagement_id: r.engagement_id, project_id: r.project_id, conversion_created: r.created });
    const outcome = await recordOutcome({
      tenant_id: h.tenant_id, brand_id: h.brand_id, subject_ref: h.subject_ref, lead_id: leadId, handoff_id: h.id, decision_id: h.decision_id,
      outcome_type: 'project_started', source: 'delivery_engagements', source_ref: r.engagement_id, occurred_at: asOf,
      metadata: { created: r.created, organization_id: r.organization_id, project_id: r.project_id, disposition },
    });
    s.outcome_ids.push(outcome.row.id);
    await ledger(h, actor, 'flotation_intake', { disposition, created: r.created, organization_id: r.organization_id, engagement_id: r.engagement_id, project_id: r.project_id, identity_id: r.identity_id, membership_id: r.membership_id, outcome_id: outcome.row.id });
    return s;
  }

  // Business.
  if (disposition === 'qualified') {
    const lead = await Lead.findByPk(leadId, { attributes: ['id', 'company'] });
    const r = await rollUpAccount({ lead: { id: leadId, company: lead?.company ?? null }, tenantId: h.tenant_id, brandId: h.brand_id });
    if (r.status === 'refused') return refuse(s, h, actor, 'account_rollup', r.reason);
    s.status = 'written';
    s.writes.push('account_rollup');
    Object.assign(s.ids, { organization_id: r.organization_id, organization_created: r.organization_created, context_id: r.context_id, context_created: r.context_created, context_updated: r.context_updated });
    await ledger(h, actor, 'account_rollup', { disposition, organization_id: r.organization_id, organization_created: r.organization_created, context_id: r.context_id, context_created: r.context_created, context_updated: r.context_updated });
  }

  const p = await advanceForDisposition({ leadId, disposition, handoffId: h.id });
  if (p.status === 'refused') return refuse(s, h, actor, 'pipeline_advance', p.reason);
  s.status = 'written';
  s.writes.push('pipeline_advance');
  Object.assign(s.ids, { stage: p.stage, advanced: p.status === 'advanced' });
  let outcome_id: string | null = null;
  if (p.status === 'advanced') {
    const outcome = await recordOutcome({
      tenant_id: h.tenant_id, brand_id: h.brand_id, subject_ref: h.subject_ref, lead_id: leadId, handoff_id: h.id, decision_id: h.decision_id,
      outcome_type: 'opportunity_stage', source: 'leads.pipeline_stage', source_ref: `${leadId}:${p.stage}`, occurred_at: asOf,
      metadata: { stage: p.stage, trigger: p.trigger, disposition },
    });
    outcome_id = outcome.row.id;
    s.outcome_ids.push(outcome_id);
  }
  await ledger(h, actor, 'pipeline_advance', { disposition, stage: p.stage, advanced: p.status === 'advanced', trigger: p.trigger, outcome_id });
  return s;
}

function skip(s: IntegrationSummary, reason: string): IntegrationSummary {
  s.status = 'skipped';
  s.reason = reason;
  return s;
}
