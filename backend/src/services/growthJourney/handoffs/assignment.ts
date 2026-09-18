import { GrowthJourneyPolicy } from '../../../models';
import type GrowthJourneyHandoff from '../../../models/GrowthJourneyHandoff';
import { isGrowthJourneyCapabilityEnabled, type GrowthJourneyFlags } from '../../../config/growthJourneyFlags';
import { classifyError } from '../../../utils/errorClassifier';
import { redactForLogs } from '../../../utils/piiRedaction';
import { getTicketCreatorAdminUserId } from '../../agentBlueprint/ticketCreatorIdentitySeed';
import { isKillSwitchActive } from '../../launchSafety';
import { recordJourneyEvent } from '../ledger';
import { createTicket, type CreateTicketData } from '../../ticketService';
import { resolveQueueCapacity } from '../capacityService';

/**
 * Assignment — the one write outside this run's tables (Phase 4 T404).
 *
 * A `tickets` row through `ticketService.createTicket` — the existing task
 * system, never a second one — and only when every gate holds, in order: the
 * `journeyHandoffs` flag, the kill switch, a `queue_assignee` policy row, the
 * queue's capacity (`unknown` blocks: an unset number is not permission), and
 * the creator identity (`GrowthJourneyHandoffs`, an `ai_staff` admin user whose
 * agent reports through AI Leadership, so `enforceReportsToGate` passes). Any
 * gate failing leaves the row `queued` with `assignment_blocked_reason` on it,
 * never a throw. NOTHING NOTIFIES ANYONE: a ticket is a row on a board.
 *
 * Split out of `handoffService.ts` (the writer and the queue) so each file has
 * one job and an import list a reader can hold; the writer re-exports
 * `assignHandoff` because the agent registry names it there.
 */

const ACTOR = 'growth_journey';
const ENTITY = 'growth_journey_handoff';
export const CREATOR_AGENT_NAME = 'GrowthJourneyHandoffs';
export const TICKET_TYPE = 'growth_journey_handoff' as const;
/** The column is VARCHAR(64); a composed reason (`capacity_unknown:lookup_failed:<class>`) is cut, never rejected. */
const BLOCKED_REASON_MAX = 64;

function log(event: string, fields: Record<string, unknown>): void {
  console.warn(redactForLogs(JSON.stringify({ service: 'growth-journey', level: 'warn', outcome: 'failure', event, ...fields })));
}

/* ── the gates ────────────────────────────────────────────────────────────── */

export type AssignResult =
  | { status: 'assigned'; ticket_id: string; assigned_to_type: string; assigned_to_id: string }
  | { status: 'queued'; reason: string }
  | { status: 'not_queued'; current: string };

async function block(row: GrowthJourneyHandoff, fullReason: string): Promise<AssignResult> {
  const reason = fullReason.slice(0, BLOCKED_REASON_MAX);
  if (row.assignment_blocked_reason !== reason) await row.update({ assignment_blocked_reason: reason });
  return { status: 'queued', reason };
}

export async function assignHandoff(row: GrowthJourneyHandoff, flags: GrowthJourneyFlags, asOf: Date = new Date()): Promise<AssignResult> {
  if (row.status !== 'queued') return { status: 'not_queued', current: row.status };
  if (!isGrowthJourneyCapabilityEnabled('journeyHandoffs', flags)) return block(row, 'flag_off');
  if (await isKillSwitchActive()) return block(row, 'kill_switch_active');

  const assignee = await GrowthJourneyPolicy.findOne({
    where: { brand_id: row.brand_id, policy_type: 'queue_assignee', owner_queue: row.owner_queue, status: 'active' },
  });
  if (!assignee?.assigned_to_type || !assignee.assigned_to_id) return block(row, 'no_assignee_policy');

  const capacity = await resolveQueueCapacity({ brandId: row.brand_id, ownerQueue: row.owner_queue, asOf });
  if (capacity.status === 'full') return block(row, 'capacity_full');
  if (capacity.status === 'unknown') return block(row, `capacity_unknown:${capacity.reason}`);

  const creatorId = await getTicketCreatorAdminUserId(CREATOR_AGENT_NAME);
  if (!creatorId) return block(row, 'creator_unregistered');

  const brandSlug = (row.evidence as { brand_program_path?: { brand_slug?: string } })?.brand_program_path?.brand_slug ?? row.brand_id;
  const data: CreateTicketData = {
    title: `Growth Journey handoff · ${row.owner_queue} · ${brandSlug} · ${row.subject_ref}`,
    type: TICKET_TYPE,
    entity_type: ENTITY,
    entity_id: row.id,
    created_by_type: 'ai_staff',
    created_by_id: creatorId,
    assigned_to_type: assignee.assigned_to_type as CreateTicketData['assigned_to_type'],
    assigned_to_id: assignee.assigned_to_id,
    priority: row.priority,
    due_date: row.sla_due_at ?? null,
    source: 'growth_journey',
    metadata: { handoff_id: row.id, decision_id: row.decision_id, brand_id: row.brand_id },
  };
  let ticket: { id: string };
  try {
    ticket = await createTicket(data);
  } catch (err: unknown) {
    const error_class = classifyError(err);
    log('growth_journey.handoff.ticket_create_failed', { error_class, handoff_id: row.id, brand_id: row.brand_id, owner_queue: row.owner_queue });
    return block(row, `ticket_create_failed:${error_class}`);
  }

  await row.update({
    status: 'assigned',
    assigned_to_type: assignee.assigned_to_type,
    assigned_to_id: assignee.assigned_to_id,
    ticket_id: ticket.id,
    assignment_blocked_reason: null,
  });
  await recordJourneyEvent('growth_journey.handoff.assigned', ENTITY, row.id, { tenant_id: row.tenant_id, brand_id: row.brand_id }, {
    handoff_id: row.id, ticket_id: ticket.id, owner_queue: row.owner_queue,
    assigned_to_type: assignee.assigned_to_type, assigned_to_id: assignee.assigned_to_id, capacity: capacity.reason,
  }, ACTOR);
  return { status: 'assigned', ticket_id: ticket.id, assigned_to_type: assignee.assigned_to_type, assigned_to_id: assignee.assigned_to_id };
}
