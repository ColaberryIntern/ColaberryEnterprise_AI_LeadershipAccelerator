import { randomUUID } from 'crypto';
import ChecklistInstance from '../../models/ChecklistInstance';
import { decideChecklistBypass, ChecklistBypassRefusal } from './checklistGate';
import { emitLedgerEventSafe } from '../workLedger/emitLedgerEventSafe';

/**
 * checklistBypassService — Reese Agentic AI Employee mission, Capability 6:
 * "Every bypass requires an authorized actor, reason, timestamp, and audit
 * event." The actor/reason/timestamp are structural fields on the
 * ChecklistInstance row itself (durable regardless of the ledger write's
 * own fate); the WorkLedgerEvent below is the ADDITIONAL work-ledger audit
 * trail the mission's Capability 7 surfaces to managers — its own write is
 * fail-open (emitLedgerEventSafe never throws) since a ledger bookkeeping
 * failure must never undo a bypass that already durably happened on the
 * instance row.
 */

export class ChecklistInstanceNotFoundError extends Error {
  readonly error_class = 'ChecklistInstanceNotFoundError' as const;
  readonly status = 404;

  constructor(id: string) {
    super(`Checklist instance "${id}" does not exist.`);
    this.name = 'ChecklistInstanceNotFoundError';
  }
}

export type BypassChecklistResult =
  | { granted: true; instance: ChecklistInstance }
  | { granted: false; refusals: ChecklistBypassRefusal[] };

export async function bypassChecklistInstance(
  checklistInstanceId: string,
  authorizedByEmail: string,
  reason: string,
): Promise<BypassChecklistResult> {
  const instance = await ChecklistInstance.findByPk(checklistInstanceId);
  if (!instance) throw new ChecklistInstanceNotFoundError(checklistInstanceId);

  const decision = decideChecklistBypass({ authorizedByEmail, reason, now: new Date() });
  if (!decision.granted) return { granted: false, refusals: decision.refusals };

  await instance.update({
    bypassed_at: decision.bypassedAt,
    bypassed_by_email: decision.authorizedByEmail,
    bypass_reason: decision.reason,
  });

  await emitLedgerEventSafe({
    traceId: randomUUID(),
    actorType: 'human',
    actorId: decision.authorizedByEmail,
    intent: 'authorize_checklist_bypass',
    domain: 'checklist',
    actionClass: 'checklist_bypass',
    targetType: 'checklist_instance',
    targetId: instance.id,
    riskTier: 'R2',
    idempotencyKey: `checklist_bypass:${instance.id}`,
    result: 'success',
    reasonCode: 'authorized_bypass',
    sourceRecordType: 'checklist_instance',
    sourceRecordId: instance.id,
  });

  return { granted: true, instance };
}
