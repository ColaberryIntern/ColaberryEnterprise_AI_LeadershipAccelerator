import { Op } from 'sequelize';
import { CommunicationLog, GrowthJourneyPolicy, InteractionOutcome, Lead, LeadTenantContext } from '../../../models';
import { loadLifecycleSourceCounts } from '../decision/lifecycleInputs';
import type { StoredSignals } from './types';

/**
 * The loaders behind a handoff's evidence packet (Phase 4 T404): counts, ids
 * and timestamps from records that already exist. No body, no address, no
 * transcript is read into memory here — the packet is built from these and
 * nothing else, so what is not loaded cannot leak.
 */

/** §11: an explicit request inside this window makes a handoff urgent regardless of its value. */
export const URGENCY_WINDOW_HOURS = 72;
const REQUEST_OUTCOMES = ['booked_meeting', 'answered'] as const;
const REQUEST_STAGES = ['proposal_sent', 'negotiation'] as const;

export interface LoadSignalsArgs {
  leadId: number | null;
  tenantId: string;
  brandId: string;
  ownerQueue: string;
  asOf: Date;
}

const NO_CONTACTS: StoredSignals['contacts'] = { by_channel: {}, total_outbound: 0, total_inbound: 0 };

async function contactsFor(leadId: number): Promise<StoredSignals['contacts']> {
  const rows = await CommunicationLog.findAll({
    where: { lead_id: leadId },
    attributes: ['channel', 'direction', 'created_at'],
    order: [['created_at', 'DESC']],
    limit: 500,
  });
  const by_channel: StoredSignals['contacts']['by_channel'] = {};
  let total_outbound = 0;
  let total_inbound = 0;
  for (const r of rows) {
    const ch = String(r.channel ?? 'email');
    const dir = String(r.direction ?? 'outbound');
    const at = r.created_at instanceof Date ? r.created_at : new Date(r.created_at);
    const c = (by_channel[ch] ??= { outbound: 0, inbound: 0, last_outbound_at: null, last_inbound_at: null });
    if (dir === 'inbound') {
      c.inbound += 1;
      total_inbound += 1;
      if (!c.last_inbound_at) c.last_inbound_at = at;
    } else {
      c.outbound += 1;
      total_outbound += 1;
      if (!c.last_outbound_at) c.last_outbound_at = at;
    }
  }
  return { by_channel, total_outbound, total_inbound };
}

async function explicitRequestFor(leadId: number, pipelineStage: string | null, asOf: Date): Promise<StoredSignals['explicit_request']> {
  const reasons: string[] = [];
  const since = new Date(asOf.getTime() - URGENCY_WINDOW_HOURS * 3_600_000);
  const recent = await InteractionOutcome.count({
    where: { lead_id: leadId, outcome: { [Op.in]: [...REQUEST_OUTCOMES] }, created_at: { [Op.gt]: since, [Op.lte]: asOf } },
  });
  if (recent > 0) reasons.push(`request_outcome_in_${URGENCY_WINDOW_HOURS}h:${recent}`);
  if (pipelineStage && (REQUEST_STAGES as readonly string[]).includes(pipelineStage)) reasons.push(`pipeline_stage:${pipelineStage}`);
  return { present: reasons.length > 0, reasons };
}

export async function loadStoredSignals(args: LoadSignalsArgs): Promise<StoredSignals> {
  const policy = await GrowthJourneyPolicy.findOne({
    where: { brand_id: args.brandId, policy_type: 'queue_capacity', owner_queue: args.ownerQueue, status: 'active' },
  });
  const sla_hours = typeof policy?.sla_hours === 'number' && policy.sla_hours > 0 ? policy.sla_hours : null;

  if (args.leadId === null) {
    return { lead: null, context: null, counts: null, contacts: NO_CONTACTS, explicit_request: { present: false, reasons: [] }, sla_hours };
  }
  const [lead, context, counts, contacts] = await Promise.all([
    Lead.findByPk(args.leadId, { attributes: ['id', 'pipeline_stage', 'industry', 'employee_count', 'annual_revenue', 'company'] }),
    LeadTenantContext.findOne({ where: { lead_id: args.leadId, tenant_id: args.tenantId, brand_id: args.brandId } }),
    loadLifecycleSourceCounts(args.leadId),
    contactsFor(args.leadId),
  ]);
  const pipeline_stage = lead?.pipeline_stage ?? null;
  const explicit_request = await explicitRequestFor(args.leadId, pipeline_stage, args.asOf);
  return {
    lead: lead
      ? { pipeline_stage, industry: lead.industry ?? null, employee_count: lead.employee_count ?? null, annual_revenue: lead.annual_revenue ?? null, has_company: Boolean(lead.company) }
      : null,
    context: context
      ? { organization_id: context.organization_id, first_source_id: context.first_source_id, first_entry_point_id: context.first_entry_point_id, first_campaign_id: context.first_campaign_id, first_touch_at: context.first_touch_at }
      : null,
    counts,
    contacts,
    explicit_request,
    sla_hours,
  };
}
