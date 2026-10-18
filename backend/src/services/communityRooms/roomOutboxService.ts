import { Op, QueryTypes, Transaction } from 'sequelize';
import { sequelize } from '../../config/database';
import RoomOutboxEvent, { RoomOutboxAggregateType } from '../../models/RoomOutboxEvent';
import { RoomEventType, eventIdempotencyKey } from './roomEvents';
import { handleRoomEvent } from './roomOutboxHandlers';

// Transactional-outbox worker for community-room domain events. Retryable +
// idempotent + multi-instance-safe (FOR UPDATE SKIP LOCKED claim), modelled on
// the scheduled_emails claim/retry/stale-recovery pattern in schedulerService.
// emit is idempotent on idempotency_key; drain is safe to run concurrently.

const MAX_BACKOFF_MS = 60 * 60 * 1000; // cap retry backoff at 1h
const STALE_PROCESSING_MS = 10 * 60 * 1000; // reclaim rows stuck 'processing' >10m

function backoffMs(attempts: number): number {
  return Math.min(2 ** attempts * 60_000, MAX_BACKOFF_MS);
}

export async function emitRoomEvent(params: {
  eventType: RoomEventType;
  aggregateType: RoomOutboxAggregateType;
  aggregateId: string;
  payload?: Record<string, unknown>;
  discriminator?: string;
  correlationId?: string | null;
}): Promise<RoomOutboxEvent> {
  const idempotency_key = eventIdempotencyKey(params.eventType, params.aggregateId, params.discriminator);
  // findOrCreate on the UNIQUE idempotency_key → emitting the same logical event
  // twice is a single row (no duplicate side effects).
  const [event] = await RoomOutboxEvent.findOrCreate({
    where: { idempotency_key },
    defaults: {
      event_type: params.eventType,
      aggregate_type: params.aggregateType,
      aggregate_id: params.aggregateId,
      payload: params.payload || {},
      idempotency_key,
      correlation_id: params.correlationId || null,
      status: 'pending',
    },
  });
  return event;
}

export const CRASH_RECOVERY_ERROR = 'reclaimed after a worker left this event in processing';
export const CRASH_RECOVERY_EXHAUSTED = 'dead-lettered: no delivery attempts left after a worker crash';

// Reset rows a crashed worker left in 'processing' so they become claimable again.
//
// A crash counts as a delivery attempt. The handler may well have run - we just never
// learned the outcome - and more importantly, without the increment an event that kills
// the worker is reclaimed every minute for ever and can never reach max_attempts. That
// is the unbounded retry CLAUDE.md prohibits, so recovery is bounded like every other
// path: this is the same semantics as a visibility timeout counting a redelivery.
//
// Dead-letter first, so a row that has just spent its last attempt is not handed back to
// the drain. Raw SQL because `attempts + 1` and `attempts + 1 >= max_attempts` are
// column expressions; routing them through Model.update would need a cast that claims
// a Literal is a number.
// Exported so the bound above can be observed directly: a crash is the one failure mode
// the drain cannot simulate from the outside, because it is defined by the drain never
// running again.
export async function recoverStaleProcessing(): Promise<void> {
  await sequelize.query(
    `UPDATE room_outbox_events
        SET status = 'dead', attempts = attempts + 1, last_error = :reason, updated_at = NOW()
      WHERE status = 'processing'
        AND updated_at < NOW() - (:staleMs * INTERVAL '1 millisecond')
        AND attempts + 1 >= max_attempts`,
    {
      replacements: { staleMs: STALE_PROCESSING_MS, reason: CRASH_RECOVERY_EXHAUSTED },
      type: QueryTypes.UPDATE,
    },
  );
  await sequelize.query(
    `UPDATE room_outbox_events
        SET status = 'failed', attempts = attempts + 1, last_error = :reason, updated_at = NOW()
      WHERE status = 'processing'
        AND updated_at < NOW() - (:staleMs * INTERVAL '1 millisecond')`,
    {
      replacements: { staleMs: STALE_PROCESSING_MS, reason: CRASH_RECOVERY_ERROR },
      type: QueryTypes.UPDATE,
    },
  );
}

async function claimBatch(limit: number): Promise<RoomOutboxEvent[]> {
  return sequelize.transaction(async (t) => {
    const rows = await RoomOutboxEvent.findAll({
      where: {
        status: { [Op.in]: ['pending', 'failed'] },
        next_attempt_at: { [Op.lte]: new Date() },
      },
      order: [['next_attempt_at', 'ASC']],
      limit,
      lock: Transaction.LOCK.UPDATE,
      skipLocked: true,
      transaction: t,
    });
    if (rows.length > 0) {
      await RoomOutboxEvent.update(
        { status: 'processing' },
        { where: { id: { [Op.in]: rows.map((r) => r.id) } }, transaction: t },
      );
    }
    return rows;
  });
}

export interface DrainResult {
  claimed: number;
  processed: number;
  failed: number;
  dead: number;
}

export async function drainOutbox(limit = 25): Promise<DrainResult> {
  await recoverStaleProcessing();
  const batch = await claimBatch(limit);
  const result: DrainResult = { claimed: batch.length, processed: 0, failed: 0, dead: 0 };
  for (const event of batch) {
    try {
      await handleRoomEvent(event);
      await event.update({ status: 'processed', processed_at: new Date(), last_error: null });
      result.processed += 1;
    } catch (err: any) {
      const attempts = event.attempts + 1;
      if (attempts >= event.max_attempts) {
        // Dead-letter: exhausted retries. Left in place with full context for triage.
        await event.update({ status: 'dead', attempts, last_error: String(err?.message || err) });
        result.dead += 1;
      } else {
        await event.update({
          status: 'failed',
          attempts,
          next_attempt_at: new Date(Date.now() + backoffMs(attempts)),
          last_error: String(err?.message || err),
        });
        result.failed += 1;
      }
    }
  }
  return result;
}
