import { GrowthJourneyHandoff } from '../../../models';
import type { GrowthJourneyHandoffAttributes, GrowthJourneyHandoffDisposition, GrowthJourneyHandoffStatus } from '../../../models/GrowthJourneyHandoff';
import { recordJourneyEvent } from '../ledger';
import { clearHumanConversation, openHumanConversation } from '../conversationOwnershipService';
import { integrateDisposition, type IntegrationSummary } from '../integration/integrateDisposition';
import { isIntegratingDisposition } from '../integration/dispositions';
import { recordOutcome } from '../outcomes/outcomeRecorder';
import { cooldownDaysFor, cooldownUntil } from './returnToAi';

/**
 * The human's three moves on a handoff, as a state machine (§11; Phase 4 T405).
 *
 *   accept       queued | assigned  → accepted        opens the human's conversation-ownership row
 *   disposition  accepted           → dispositioned   (qualified | converted | no_contact | disqualified)
 *                accepted           → returned_to_ai  (not_ready | nurture) with a cooldown the strategies honour
 *   release      assigned | accepted → queued          the ownership row cleared, the queue takes it back
 *
 * Every other transition is a `HandoffTransitionError` (409, `ValidationError`)
 * - accepting twice, dispositioning a row nobody accepted, releasing a queued
 * row. Every transition is an `event_ledger` row with tenant and brand, ids
 * and reasons only. Every disposition clears the ownership row T402 keeps, so
 * the AI's pause lifts the moment the human is done; `not_ready` / `nurture`
 * then hold the AI off for the cooldown instead.
 *
 * ─── THE ONE DOOR TO THE EXISTING SYSTEMS ───────────────────────────────────
 *
 * `qualified` / `converted` reach the integration writers (T406) through
 * `integrateDisposition` - the account roll-up, the pipeline stage, the AI
 * Flotation conversion - each behind the kill switch, each idempotent on what
 * already exists, a refusal recorded on the row (`integration_refused`) and
 * never failing the verdict. That call sits BEFORE the ownership clear and
 * the one terminal update, so a failure inside a writer leaves the handoff
 * `accepted` with the human still owning the thread, and the retry re-runs
 * writers that find what they wrote.
 * This file is the only file outside `integration/` that may import it
 * (`integrationIsolation.test.ts`). It notifies nobody.
 */

export class HandoffTransitionError extends Error {
  readonly error_class = 'ValidationError';
  readonly status = 409;
  constructor(readonly from: GrowthJourneyHandoffStatus, readonly action: string) {
    super(`handoff is ${from}; it cannot be ${action}`);
    this.name = 'HandoffTransitionError';
  }
}

export const ACCEPT_FROM: readonly GrowthJourneyHandoffStatus[] = ['queued', 'assigned'];
export const DISPOSITION_FROM: readonly GrowthJourneyHandoffStatus[] = ['accepted'];
export const RELEASE_FROM: readonly GrowthJourneyHandoffStatus[] = ['assigned', 'accepted'];
export const RETURN_DISPOSITIONS: readonly GrowthJourneyHandoffDisposition[] = ['not_ready', 'nurture'];
export const CLOSING_DISPOSITIONS: readonly GrowthJourneyHandoffDisposition[] = ['qualified', 'converted', 'no_contact', 'disqualified'];

const ACTOR_PREFIX = 'admin';
const ENTITY = 'growth_journey_handoff';

export interface HumanActor {
  /** The admin user's id (AuthPayload `sub`), the way the classification override records `decided_by`. */
  id: string;
  email?: string | null;
  /** The admin's platform identity when the request carried one: the actor on a conversion's audit event and membership grant (T406). */
  platformIdentityId?: string | null;
}

function guard(row: GrowthJourneyHandoff, allowed: readonly GrowthJourneyHandoffStatus[], action: string): void {
  if (!allowed.includes(row.status)) throw new HandoffTransitionError(row.status, action);
}

async function ledger(row: GrowthJourneyHandoff, event: string, actor: HumanActor, payload: Record<string, unknown>): Promise<void> {
  await recordJourneyEvent(event, ENTITY, row.id, { tenant_id: row.tenant_id, brand_id: row.brand_id }, { handoff_id: row.id, subject_ref: row.subject_ref, lead_id: row.lead_id, owner_queue: row.owner_queue, ...payload }, `${ACTOR_PREFIX}:${actor.id}`);
}

async function clearOwnership(row: GrowthJourneyHandoff, actor: HumanActor, reason: string, asOf: Date): Promise<number> {
  if (row.lead_id === null) return 0;
  const { cleared } = await clearHumanConversation({ leadId: row.lead_id, brandId: row.brand_id, clearedBy: `${ACTOR_PREFIX}:${actor.id}`, reason, asOf });
  return cleared;
}

/** A human takes the handoff: `accepted`, the thread theirs (the T402 row), an outcome on the index. */
export async function acceptHandoff(row: GrowthJourneyHandoff, actor: HumanActor, asOf: Date = new Date()): Promise<GrowthJourneyHandoff> {
  guard(row, ACCEPT_FROM, 'accepted');
  const from = row.status;
  await row.update({ status: 'accepted', accepted_at: asOf, assigned_to_type: 'human', assigned_to_id: actor.id, assignment_blocked_reason: null });
  let ownership_id: string | null = null;
  if (row.lead_id !== null) {
    const { row: own } = await openHumanConversation({ tenantId: row.tenant_id, brandId: row.brand_id, leadId: row.lead_id, ownerId: actor.id, channel: row.best_channel, source: 'handoff_accepted', sinceAt: asOf });
    ownership_id = own.id;
  }
  const outcome = await recordOutcome({ tenant_id: row.tenant_id, brand_id: row.brand_id, subject_ref: row.subject_ref, lead_id: row.lead_id, handoff_id: row.id, decision_id: row.decision_id, outcome_type: 'handoff_accepted', source: 'growth_journey_handoffs', source_ref: `${row.id}:accepted`, occurred_at: asOf });
  await ledger(row, 'growth_journey.handoff.accepted', actor, { from, ownership_id, outcome_id: outcome.row.id });
  return row;
}

export interface DispositionInput {
  disposition: GrowthJourneyHandoffDisposition;
  reason: string;
  cooldown_days?: number;
}

export interface DispositionResult {
  row: GrowthJourneyHandoff;
  status: GrowthJourneyHandoffStatus;
  cooldown_until: Date | null;
  cooldown_source: 'body' | 'policy' | 'default' | null;
  ownership_cleared: number;
  outcome_id: string;
  /** What reached the existing systems (T406); null for a disposition that never asks (not_ready, nurture, no_contact, disqualified). */
  integration: IntegrationSummary | null;
}

/** The human's verdict: closed, or back to the AI with a cooldown. Integration writers are T406's, behind their own checks. */
export async function dispositionHandoff(row: GrowthJourneyHandoff, input: DispositionInput, actor: HumanActor, asOf: Date = new Date()): Promise<DispositionResult> {
  guard(row, DISPOSITION_FROM, 'dispositioned');
  const from = row.status;
  const returning = RETURN_DISPOSITIONS.includes(input.disposition);
  const base = { disposition: input.disposition, disposition_reason: input.reason, disposition_at: asOf, dispositioned_by: `${ACTOR_PREFIX}:${actor.id}` };

  let cooldown_until: Date | null = null;
  let cooldown_source: DispositionResult['cooldown_source'] = null;
  let patch: Partial<GrowthJourneyHandoffAttributes> = { ...base, status: 'dispositioned' };
  if (returning) {
    const { days, source } = await cooldownDaysFor(row.brand_id, input.cooldown_days);
    cooldown_until = cooldownUntil(asOf, days);
    cooldown_source = source;
    const program_slug = (row.evidence as { brand_program_path?: { program?: { slug?: string } | null } })?.brand_program_path?.program?.slug ?? 'unknown';
    patch = { ...base, status: 'returned_to_ai', return_to_ai: { program_slug, cooldown_until: cooldown_until.toISOString(), reason: `${input.disposition}:${input.reason}` } };
  }
  // Reads first, then the ownership row is cleared BEFORE the row turns terminal: a failure here leaves the
  // handoff `accepted`, where a retry is legal. The other order left a dispositioned row
  // with the human-conversation row still open and no route that could ever clear it -
  // the AI paused for that lead until someone fixed the table by hand (the T405 verifier's observation).
  // A failure AFTER the update leaves an outcome or ledger row missing, which T409's
  // normaliser (handoffs are one of its sources) and the ledger adapter can back-fill.
  // The existing systems are written while the human still owns the thread: a writer
  // that throws leaves the handoff `accepted` AND the ownership row open, so the AI
  // stays paused until the retry lands (the T406 verifier's observation).
  const integration = isIntegratingDisposition(input.disposition)
    ? await integrateDisposition({ handoff: row, disposition: input.disposition, actor: { id: actor.id, platformIdentityId: actor.platformIdentityId ?? null }, asOf })
    : null;
  patch.integration_refused = integration?.refusals[0]?.reason.slice(0, 64) ?? null;
  const ownership_cleared = await clearOwnership(row, actor, `dispositioned:${input.disposition}`, asOf);
  await row.update(patch);

  const outcome = await recordOutcome({
    tenant_id: row.tenant_id, brand_id: row.brand_id, subject_ref: row.subject_ref, lead_id: row.lead_id, handoff_id: row.id, decision_id: row.decision_id,
    outcome_type: 'handoff_dispositioned', source: 'growth_journey_handoffs', source_ref: `${row.id}:${input.disposition}`, occurred_at: asOf,
    metadata: { disposition: input.disposition, returned_to_ai: returning, cooldown_until: cooldown_until?.toISOString() ?? null },
  });
  await ledger(row, returning ? 'growth_journey.handoff.returned_to_ai' : 'growth_journey.handoff.dispositioned', actor, {
    from, disposition: input.disposition, reason: input.reason, cooldown_until: cooldown_until?.toISOString() ?? null, cooldown_source, ownership_cleared, outcome_id: outcome.row.id,
    integration: integration ? { status: integration.status, reason: integration.reason, writes: integration.writes, refusals: integration.refusals, outcome_ids: integration.outcome_ids } : null,
  });
  return { row, status: row.status, cooldown_until, cooldown_source, ownership_cleared, outcome_id: outcome.row.id, integration };
}

/** The human gives it back: `queued`, the ownership row cleared, the ticket kept (a re-assignment finds it again). */
export async function releaseHandoff(row: GrowthJourneyHandoff, actor: HumanActor, reason: string, asOf: Date = new Date()): Promise<{ row: GrowthJourneyHandoff; ownership_cleared: number }> {
  guard(row, RELEASE_FROM, 'released');
  const from = row.status;
  await row.update({ status: 'queued', accepted_at: null, assigned_to_type: null, assigned_to_id: null, assignment_blocked_reason: 'released' });
  const ownership_cleared = await clearOwnership(row, actor, `released:${reason}`, asOf);
  await ledger(row, 'growth_journey.handoff.released', actor, { from, reason, ownership_cleared });
  return { row, ownership_cleared };
}
