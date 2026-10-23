/**
 * broadcastCommandService — persists producer commands and provider events for one
 * occurrence, and emits the domain event when a broadcast actually goes live.
 *
 * The decision logic is NOT here. It lives in broadcastStateMachine, which is pure and
 * exhaustively tested; this module is the thin I/O layer that loads a row, asks the machine
 * what should happen, writes the result under an optimistic-concurrency guard, and emits.
 *
 * Two things worth knowing about the write path:
 *
 * CONCURRENCY IS ENFORCED BY THE UPDATE, NOT BY THE READ. The machine checks the version it
 * was handed, but a check-then-write still races: two callers can both read version 4 and
 * both pass. So the UPDATE itself carries `WHERE version = :expected`, and an affected-row
 * count of 0 is the real conflict signal. This is the same arbitrated-by-the-database shape
 * that email/idempotentSend.ts uses, and for the same reason — the app cannot win that race
 * on its own.
 *
 * SessionWentLive IS EMITTED, FINALLY. The constant has existed at roomEvents.ts:14 with a
 * no-op handler since the rooms feature shipped, and nothing has ever emitted it. The outbox
 * dedupes on (eventType, aggregateId, discriminator), so the discriminator is the occurrence
 * version at go-live: a retried command cannot double-emit, and a genuine
 * live -> reconnecting -> live cycle does not re-announce either, because going live again
 * is a provider-health transition, not a second go_live command.
 */
import { sequelize } from '../../config/database';
import BroadcastOccurrence from '../../models/BroadcastOccurrence';
import { emitRoomEvent } from '../communityRooms/roomOutboxService';
import { ROOM_EVENTS } from '../communityRooms/roomEvents';
import { ensureTraceId } from '../../utils/requestContext';
import {
  applyProducerCommand,
  applyProviderEvent,
  type ProducerCommand,
  type ProviderEvent,
  type OccurrenceState,
  type EndReason,
} from './broadcastStateMachine';

export interface CommandRequest {
  occurrenceId: string;
  command: ProducerCommand;
  expectedVersion: number;
  isProducer: boolean;
  nowMs?: number;
  /**
   * Who is ending it, on an `end` command. Omitted means a person pressed the button, which is
   * what every caller before L7.4's safety net was.
   */
  endReason?: EndReason;
}

export interface CommandResponse {
  ok: boolean;
  occurrence?: BroadcastOccurrence;
  noop?: boolean;
  error_class?: string;
  status?: number;
  reason?: string;
}

function tagged(error_class: string, status: number, reason: string): CommandResponse {
  return { ok: false, error_class, status, reason };
}

function toState(o: BroadcastOccurrence): OccurrenceState {
  return {
    editorial_state: o.editorial_state,
    provider_health: o.provider_health,
    version: o.version,
    content_started_at: o.content_started_at,
    ended_at: o.ended_at,
    end_reason: o.end_reason,
  };
}

/**
 * Apply a producer command. Returns the updated row, or a tagged refusal.
 *
 * Note the ordering: the state machine decides, the database arbitrates, and only a write
 * that actually changed a row emits anything. An event emitted before the commit would
 * announce a broadcast that might not have gone live.
 */
export async function runProducerCommand(req: CommandRequest): Promise<CommandResponse> {
  const nowMs = req.nowMs ?? Date.now();

  const occurrence = await BroadcastOccurrence.findByPk(req.occurrenceId);
  if (!occurrence) return tagged('NotFoundError', 404, 'occurrence_not_found');

  const decision = applyProducerCommand(toState(occurrence), req.command, {
    expectedVersion: req.expectedVersion,
    nowMs,
    isProducer: req.isProducer,
    endReason: req.endReason,
  });

  if (!decision.ok) {
    return { ok: false, error_class: decision.error_class, status: decision.status, reason: decision.reason };
  }
  if (decision.noop || !decision.patch) {
    // A duplicate click. Deliberately does NOT bump the version, so a concurrent caller
    // holding the same version is not spuriously conflicted by someone else's no-op.
    return { ok: true, noop: true, occurrence };
  }

  const patch = decision.patch;
  const wentLive = patch.editorial_state === 'live';

  const updated = await sequelize.transaction(async (tx) => {
    // The guard that actually matters: another writer between our read and this write
    // leaves version != expected, so this updates 0 rows.
    const [affected] = await BroadcastOccurrence.update(
      patch,
      { where: { id: req.occurrenceId, version: req.expectedVersion }, transaction: tx },
    );
    if (affected === 0) return null;
    return BroadcastOccurrence.findByPk(req.occurrenceId, { transaction: tx });
  });

  if (!updated) {
    return tagged('VersionConflict', 409, 'row changed between read and write');
  }

  if (wentLive) {
    // Post-commit, so a rolled-back transition never announces itself. The outbox is
    // idempotent on its key, so a retry of this whole function emits once.
    await emitRoomEvent({
      eventType: ROOM_EVENTS.SessionWentLive,
      aggregateType: 'broadcast',
      aggregateId: updated.id,
      discriminator: String(updated.version),
      correlationId: ensureTraceId(),
      payload: {
        occurrence_key: updated.occurrence_key,
        room_id: updated.room_id,
        access_mode: updated.access_mode,
        content_started_at: updated.content_started_at?.toISOString() ?? null,
        preview_seconds: updated.preview_seconds,
      },
    });
  }

  return { ok: true, occurrence: updated };
}

/**
 * Fold a provider health event into the occurrence.
 *
 * `lastAppliedMs` is the caller's record of the newest provider event already applied; the
 * machine drops anything at or before it, so a late or duplicated webhook cannot drag a live
 * broadcast backwards. This never emits SessionWentLive: a provider cannot publish a
 * broadcast, only a producer can.
 */
export async function runProviderEvent(
  occurrenceId: string,
  event: ProviderEvent,
  lastAppliedMs: number,
): Promise<CommandResponse> {
  const occurrence = await BroadcastOccurrence.findByPk(occurrenceId);
  if (!occurrence) return tagged('NotFoundError', 404, 'occurrence_not_found');

  const decision = applyProviderEvent(toState(occurrence), event, lastAppliedMs);
  if (decision.noop || !decision.patch) return { ok: true, noop: true, occurrence };

  const expected = occurrence.version;
  const [affected] = await BroadcastOccurrence.update(
    decision.patch,
    { where: { id: occurrenceId, version: expected } },
  );
  if (affected === 0) return tagged('VersionConflict', 409, 'row changed between read and write');

  const updated = await BroadcastOccurrence.findByPk(occurrenceId);
  return { ok: true, occurrence: updated! };
}
