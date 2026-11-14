import crypto from 'crypto';
import { UniqueConstraintError } from 'sequelize';
import { sequelize } from '../../config/database';
import MayaOutboundApproval, { type MayaOutboundStatus } from '../../models/MayaOutboundApproval';
import { resolveRecordedHumans } from '../agentDomain/recordedHumans';
import { classifyError } from '../../utils/errorClassifier';
import { deliverOutboundRow, type OutboundDelivery } from './mayaOutboundDelivery';

/**
 * The queue where every message Maya composes for a real person waits for Ali's decision.
 *
 * -- THE INVARIANT THIS SERVES --
 *
 *   No message Maya composes for a real person is delivered without Ali deciding that exact
 *   message. Not by a retry, a replay, a cron, a timeout, a second tool call, or a bulk button.
 *
 * Each clause of that sentence is a specific defence here, and each one is a specific defect
 * that has already happened in this repository:
 *
 *   a retry      `approve` claims the row with a conditional UPDATE, so the second caller loses
 *                the race and sends nothing.
 *   a replay     `enqueue` is keyed on `idempotency_key`, so composing twice is one row.
 *   a cron       there is NO timer in this module and none may be added. `approvalRequestTimeout
 *                Job.ts` is what one looks like: it approved every expired pending row and
 *                replayed 851 DMs to 52 students. The expiry sweep lives in
 *                `mayaOutboundExpiry.ts` and can write only `expired`.
 *   a timeout    `expires_at` has no path to `approved`. The database rejects a `decided_by`
 *                beginning with `system:`, which is the shape a timer approval has.
 *   a 2nd call   same claim as the retry.
 *   a bulk button  there is no bulk approve function here, and the review page has no control
 *                for one. Approving is one id at a time, on purpose.
 *
 * -- WHY A FAILED DELIVERY IS NOT RETRIED --
 *
 * `approve` moves the row to `sending` before it calls the provider, and a process that dies
 * mid-delivery leaves it there. That is deliberate and it is the safe direction: an automatic
 * retry of an outbound message is exactly the mechanism that produced the 851 replays. A stuck
 * `sending` row is a manual triage item, documented in the handoff, not something this module
 * resolves on its own.
 */

/** How long an undecided message waits before it stops waiting. It expires; it never sends. */
export const OUTBOUND_EXPIRY_DAYS = 7;

export interface MayaOutboundInput {
  /** Opaque id, never an email address. */
  recipientRef: string;
  recipientAddress: string;
  recipientDisplay?: string | null;
  channel: string;
  subject?: string | null;
  /** The exact bytes the provider will receive. Rendered now, not at delivery. */
  body: string;
  composedBy: string;
  capability: string;
  correlationId: string;
  idempotencyKey: string;
}

export interface OutboundEnqueueResult {
  id: string;
  idempotencyKey: string;
  /** True when this compose had already been queued and no second row was written. */
  deduped: boolean;
}

/** Why a decision was refused. Every one is a sentence the console shows, not a 500. */
export type OutboundRefusal =
  | 'row_not_found'
  | 'approver_missing'
  | 'approver_is_non_human'
  | 'approver_not_a_recorded_human'
  | 'body_changed_since_review'
  | 'not_awaiting_approval';

export interface OutboundDecisionResult {
  ok: boolean;
  id: string;
  status: MayaOutboundStatus;
  refusal?: OutboundRefusal;
  message?: string;
}

export interface MayaOutboundQueueDeps {
  /** Positive lookup against records we keep. A denylist cannot establish humanity. */
  recordedHumans: (email: string) => Promise<string[]>;
  deliver: (row: MayaOutboundApproval) => Promise<OutboundDelivery>;
  now: () => Date;
}

function defaultDeps(): MayaOutboundQueueDeps {
  return {
    recordedHumans: (email) => resolveRecordedHumans(sequelize, email),
    deliver: deliverOutboundRow,
    now: () => new Date(),
  };
}

/** The pin on what was reviewed. Approval transmits these bytes or refuses. */
export function computeBodyHash(body: string): string {
  return crypto.createHash('sha256').update(body, 'utf8').digest('hex');
}

function log(event: string, outcome: 'success' | 'failure', context: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(), level: outcome === 'failure' ? 'warn' : 'info',
    service: 'maya', event, outcome, ...context,
  }));
}

/**
 * Queue one composed message.
 *
 * Idempotent on `idempotency_key`, enforced by a UNIQUE index rather than by a read-then-write,
 * so two concurrent composes of the same message produce one row and not two. The loser of that
 * race reads the winner's row and reports `deduped`.
 */
export async function enqueueOutbound(
  input: MayaOutboundInput, deps: MayaOutboundQueueDeps = defaultDeps(),
): Promise<OutboundEnqueueResult> {
  const body = input.body ?? '';
  if (body.trim().length === 0) {
    // A row with no body is not an approval of a message. Refusing here rather than storing a
    // placeholder is the whole reason the `review` mode composes before it queues.
    throw new Error('ContractViolation: refusing to queue an outbound message with an empty body');
  }
  const expires = new Date(deps.now().getTime() + OUTBOUND_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  try {
    const row = await MayaOutboundApproval.create({
      recipient_ref: input.recipientRef,
      recipient_address: input.recipientAddress,
      recipient_display: input.recipientDisplay ?? null,
      channel: input.channel,
      subject: input.subject ?? null,
      body,
      body_hash: computeBodyHash(body),
      composed_by: input.composedBy,
      capability: input.capability,
      correlation_id: input.correlationId,
      idempotency_key: input.idempotencyKey,
      status: 'pending_approval',
      expires_at: expires,
    });
    log('maya_outbound_queued', 'success', {
      correlation_id: input.correlationId,
      context: {
        id: row.id, capability: input.capability, channel: input.channel,
        composed_by: input.composedBy, recipient_ref: input.recipientRef,
      },
    });
    return { id: row.id, idempotencyKey: input.idempotencyKey, deduped: false };
  } catch (err: unknown) {
    if (!(err instanceof UniqueConstraintError)) throw err;
    const existing = await MayaOutboundApproval.findOne({
      where: { idempotency_key: input.idempotencyKey },
    });
    if (!existing) throw err;
    log('maya_outbound_queue_deduped', 'success', {
      correlation_id: input.correlationId,
      context: { id: existing.id, status: existing.status, recipient_ref: input.recipientRef },
    });
    return { id: existing.id, idempotencyKey: input.idempotencyKey, deduped: true };
  }
}

function refuse(id: string, status: MayaOutboundStatus, refusal: OutboundRefusal, message: string): OutboundDecisionResult {
  log('maya_outbound_decision_refused', 'failure', {
    error_class: 'ContractViolation', context: { id, status, refusal },
  });
  return { ok: false, id, status, refusal, message };
}

/**
 * Establish that the decider is a person we hold a record of.
 *
 * The denylist half is not sufficient and that is recorded in `recordedHumans.ts`: the real
 * production timer identity is one letter from a value a denylist would pass. So this is a
 * positive lookup, and `unknown` - the default `approvedBy` elsewhere in this repo - fails it
 * for the same reason any other unrecorded string does.
 */
async function approverProblem(
  approver: string, deps: MayaOutboundQueueDeps,
): Promise<OutboundRefusal | null> {
  const who = (approver ?? '').trim();
  if (!who) return 'approver_missing';
  if (who === 'unknown' || who.startsWith('system:')) return 'approver_is_non_human';
  const found = await deps.recordedHumans(who);
  return found.length > 0 ? null : 'approver_not_a_recorded_human';
}

/**
 * Approve one message and deliver it. One id, one decision, one delivery.
 *
 * The order matters and is not arbitrary: the approver is established, then the body is
 * re-hashed against what was reviewed, and only then is the row claimed. A row is never moved
 * out of `pending_approval` by a call that was going to be refused anyway.
 */
export async function approveOutbound(
  id: string, approver: string, note?: string, deps: MayaOutboundQueueDeps = defaultDeps(),
): Promise<OutboundDecisionResult> {
  const row = await MayaOutboundApproval.findByPk(id);
  if (!row) return refuse(id, 'pending_approval', 'row_not_found', `No queued message ${id}`);

  const problem = await approverProblem(approver, deps);
  if (problem) {
    return refuse(id, row.status, problem,
      'Approving a message Maya composed requires a person we hold a record of.');
  }

  // WHAT WAS SHOWN IS WHAT IS SENT. If the stored body no longer hashes to what was pinned at
  // compose time, something edited it after review, and the thing Ali read is not the thing that
  // would go out. Refuse rather than send either version.
  if (computeBodyHash(row.body) !== row.body_hash) {
    return refuse(id, row.status, 'body_changed_since_review',
      'This message changed after it was composed. It was not sent. Compose it again.');
  }

  const at = deps.now();
  // THE CLAIM. Only a row still awaiting a decision can be moved, and only one caller can move
  // it, so a double click loses here rather than at the provider.
  const [claimed] = await MayaOutboundApproval.update(
    { status: 'sending', decided_by: approver.trim(), decided_at: at, decision_note: note ?? null, updated_at: at },
    { where: { id, status: 'pending_approval' } },
  );
  if (claimed === 0) {
    const current = await MayaOutboundApproval.findByPk(id);
    return refuse(id, current?.status ?? 'expired', 'not_awaiting_approval',
      `This message is ${current?.status ?? 'gone'}, not awaiting approval. It was not sent again.`);
  }
  await row.reload();

  try {
    const delivery = await deps.deliver(row);
    await MayaOutboundApproval.update(
      { status: 'sent', delivered_at: deps.now(), updated_at: deps.now() },
      { where: { id, status: 'sending' } },
    );
    log('maya_outbound_delivered', 'success', {
      correlation_id: row.correlation_id,
      context: {
        id, capability: row.capability, channel: row.channel, decided_by: approver.trim(),
        recipient_ref: row.recipient_ref, provider_ref: delivery.providerRef ?? null,
      },
    });
    return { ok: true, id, status: 'sent' };
  } catch (err: unknown) {
    const errorClass = classifyError(err);
    await MayaOutboundApproval.update(
      { status: 'failed', failure_reason: errorClass, updated_at: deps.now() },
      { where: { id, status: 'sending' } },
    );
    log('maya_outbound_delivery_failed', 'failure', {
      correlation_id: row.correlation_id, error_class: errorClass,
      context: { id, capability: row.capability, channel: row.channel, recipient_ref: row.recipient_ref },
    });
    // NOT rethrown and NOT retried. The row records the failure and a person decides what to do.
    return { ok: false, id, status: 'failed', message: `Delivery failed (${errorClass}). Nothing was sent.` };
  }
}

/** Say no. Terminal, and the row keeps who said it and why. */
export async function rejectOutbound(
  id: string, approver: string, note: string, deps: MayaOutboundQueueDeps = defaultDeps(),
): Promise<OutboundDecisionResult> {
  const problem = await approverProblem(approver, deps);
  if (problem) return refuse(id, 'pending_approval', problem, 'A rejection is a person\'s decision too.');
  const at = deps.now();
  const [claimed] = await MayaOutboundApproval.update(
    { status: 'rejected', decided_by: approver.trim(), decided_at: at, decision_note: note, updated_at: at },
    { where: { id, status: 'pending_approval' } },
  );
  if (claimed === 0) {
    const current = await MayaOutboundApproval.findByPk(id);
    if (!current) return refuse(id, 'pending_approval', 'row_not_found', `No queued message ${id}`);
    return refuse(id, current.status, 'not_awaiting_approval', `This message is already ${current.status}.`);
  }
  log('maya_outbound_rejected', 'success', { context: { id, decided_by: approver.trim() } });
  return { ok: true, id, status: 'rejected' };
}

/**
 * The COMPOSING side pulling a message back before anyone decided it.
 *
 * Not a decision, so it needs no approver: nothing is delivered and nothing reaches a person.
 * Keyed on the idempotency key rather than the id because the caller withdrawing it is the one
 * that composed it, and that is the handle it holds.
 */
export async function withdrawOutbound(
  idempotencyKey: string, reason: string, deps: MayaOutboundQueueDeps = defaultDeps(),
): Promise<OutboundDecisionResult> {
  const at = deps.now();
  const [claimed] = await MayaOutboundApproval.update(
    { status: 'withdrawn', decision_note: reason, updated_at: at },
    { where: { idempotency_key: idempotencyKey, status: 'pending_approval' } },
  );
  const row = await MayaOutboundApproval.findOne({ where: { idempotency_key: idempotencyKey } });
  if (!row) return refuse(idempotencyKey, 'pending_approval', 'row_not_found', 'No such queued message');
  if (claimed === 0) {
    return refuse(row.id, row.status, 'not_awaiting_approval', `This message is already ${row.status}.`);
  }
  log('maya_outbound_withdrawn', 'success', { context: { id: row.id, reason } });
  return { ok: true, id: row.id, status: 'withdrawn' };
}

/** What is waiting for a person, oldest first. One screen, one message at a time. */
export async function listPendingOutbound(limit = 50): Promise<MayaOutboundApproval[]> {
  return MayaOutboundApproval.findAll({
    where: { status: 'pending_approval' },
    order: [['created_at', 'ASC']],
    limit: Math.min(Math.max(limit, 1), 200),
  });
}
