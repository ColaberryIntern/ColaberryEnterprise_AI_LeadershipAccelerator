import { sequelize } from '../../config/database';
import { computeIdempotencyKey } from './idempotencyKey';

export { computeIdempotencyKey };

/**
 * The transactional-send idempotency guard.
 *
 * ── HOW THIS PREVENTS A DUPLICATE RATHER THAN DETECTING ONE ─────────────────
 *
 * The naive shape is SELECT-then-INSERT: look for a prior send, and if there
 * isn't one, send. That is a check-then-act race. Two workers, or one worker
 * retried while its first attempt is still in flight, both SELECT nothing, both
 * proceed, and the student gets two emails. The check ran first and prevented
 * nothing.
 *
 * What happens here instead: the claim is a single statement whose success is
 * decided by a UNIQUE index inside Postgres.
 *
 *   INSERT ... ON CONFLICT (idempotency_key) DO UPDATE
 *      SET status = 'claimed', attempts = attempts + 1, ...
 *    WHERE email_send_ledger.status = 'failed'
 *   RETURNING id, attempts
 *
 * Postgres takes a row lock on the conflicting tuple, so the second caller
 * BLOCKS until the first commits and then re-reads the committed row. The
 * arbitration is done by the index, not by the application, and the application
 * cannot observe a window in which neither side has claimed.
 *
 * The `WHERE` on the DO UPDATE is the state machine:
 *
 *   no row            -> the INSERT wins        -> 1 row returned -> SEND
 *   status = 'failed' -> the UPDATE fires       -> 1 row returned -> RETRY
 *   status = 'sent'   -> WHERE false, no update -> 0 rows         -> REFUSE
 *   status = 'claimed'-> WHERE false, no update -> 0 rows         -> REFUSE
 *
 * Zero rows returned is a refusal. It is not an error the caller may retry past
 * and it is not advisory. `sendOnce` will not call the provider without a row.
 *
 * A `sent` row can never be moved back to `claimed` by this statement, which is
 * what makes a successful send unrepeatable: there is no code path from `sent`
 * to another provider call. Not "we check and skip" — there is no path.
 *
 * ── WHY A CRASHED CLAIM DOES NOT AUTO-RELEASE ───────────────────────────────
 *
 * If the process dies between the claim and the outcome write, the row is left
 * `claimed` and every later attempt is refused. That is deliberate. We do not
 * know whether Mandrill accepted the message before we died, so releasing the
 * claim on a timer would convert an unknown into a duplicate at exactly the
 * moment nobody is watching. Recovery is `releaseClaim()` — explicit, attributed
 * to an operator, and logged. A stuck claim is a human decision, by design.
 */

export const LEDGER_TABLE = 'email_send_ledger';

export type ClaimRefusalReason = 'already_sent' | 'in_flight' | 'duplicate_natural_key';

export interface SendIdentity {
  /** Intended mailbox. Lower-cased before hashing and before storage lookup. */
  recipient: string;
  /** Exact subject line as it will appear in the message. */
  subject: string;
  /** Stable id for the business event, e.g. `story000-unblock-2026-08-17`. */
  businessEventId: string;
  /**
   * Precomputed key. Optional. When supplied it is CHECKED against the locally
   * derived value and a mismatch throws, because a caller that hands over a key
   * derived from different inputs than it is about to send is the one failure
   * the hash index cannot catch.
   */
  idempotencyKey?: string;
  correlationId?: string;
}

export type ClaimResult =
  | { granted: true; ledgerId: string; idempotencyKey: string; attempts: number }
  | { granted: false; reason: ClaimRefusalReason; idempotencyKey: string };

export interface ProviderResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  errorClass?: string;
}

export type SendOnceResult =
  | { outcome: 'sent'; ledgerId: string; idempotencyKey: string; messageId?: string }
  | { outcome: 'skipped'; reason: ClaimRefusalReason; idempotencyKey: string }
  | { outcome: 'failed'; ledgerId: string; idempotencyKey: string; errorClass: string; error: string };

/** Postgres unique-violation SQLSTATE, however the driver chooses to surface it. */
function isUniqueViolation(err: any): boolean {
  const code = err?.parent?.code ?? err?.original?.code ?? err?.code;
  return code === '23505';
}

function resolveKey(id: SendIdentity): string {
  const derived = computeIdempotencyKey(id.recipient, id.subject, id.businessEventId);
  if (id.idempotencyKey && id.idempotencyKey !== derived) {
    throw new Error(
      `IdempotencyKeyMismatch: supplied ${id.idempotencyKey} but ` +
        `(recipient|subject|business_event_id) derives ${derived}. ` +
        'Refusing to send: the key on the draft does not describe the message being sent.',
    );
  }
  return derived;
}

/**
 * Claim the right to send. Returns granted:false when the send must not happen.
 * The caller does not get to decide; a refusal has no override.
 */
export async function claimSend(id: SendIdentity): Promise<ClaimResult> {
  const key = resolveKey(id);
  const recipient = id.recipient.trim();

  try {
    const [rows]: any = await sequelize.query(
      `INSERT INTO ${LEDGER_TABLE}
         (idempotency_key, recipient, subject, business_event_id,
          status, attempts, correlation_id, claimed_at, updated_at)
       VALUES ($key, $recipient, $subject, $eventId, 'claimed', 1, $correlationId, NOW(), NOW())
       ON CONFLICT (idempotency_key) DO UPDATE
          SET status = 'claimed',
              attempts = ${LEDGER_TABLE}.attempts + 1,
              error_class = NULL,
              error_detail = NULL,
              claimed_at = NOW(),
              updated_at = NOW()
        WHERE ${LEDGER_TABLE}.status = 'failed'
       RETURNING id, attempts`,
      {
        bind: {
          key,
          recipient,
          subject: id.subject,
          eventId: id.businessEventId,
          correlationId: id.correlationId ?? null,
        },
      },
    );

    const row = rows?.[0];
    if (row) {
      return {
        granted: true,
        ledgerId: String(row.id),
        idempotencyKey: key,
        attempts: Number(row.attempts),
      };
    }
  } catch (err: any) {
    // Conflict on the NATURAL key rather than the hash: same recipient, same
    // subject, same event, different hash. That means the hash was computed
    // from something other than what is being sent, and the triple index is the
    // only thing standing between this student and a second copy. Refuse.
    if (isUniqueViolation(err)) {
      logLedgerEvent('email_send_claim_refused', 'success', {
        idempotency_key: key,
        reason: 'duplicate_natural_key',
        business_event_id: id.businessEventId,
      });
      return { granted: false, reason: 'duplicate_natural_key', idempotencyKey: key };
    }
    throw err;
  }

  // Zero rows: the row exists and is not retryable. Read WHY, for the log only.
  const [stateRows]: any = await sequelize.query(
    `SELECT status FROM ${LEDGER_TABLE} WHERE idempotency_key = $key`,
    { bind: { key } },
  );
  const status = stateRows?.[0]?.status;
  const reason: ClaimRefusalReason = status === 'sent' ? 'already_sent' : 'in_flight';

  logLedgerEvent('email_send_claim_refused', 'success', {
    idempotency_key: key,
    reason,
    existing_status: status ?? null,
    business_event_id: id.businessEventId,
  });
  return { granted: false, reason, idempotencyKey: key };
}

/**
 * Mark a claim delivered. Terminal: nothing in this module moves a row out of
 * `sent`, so after this returns the message cannot be sent again.
 */
export async function recordSendSuccess(ledgerId: string, providerMessageId?: string): Promise<void> {
  await sequelize.query(
    `UPDATE ${LEDGER_TABLE}
        SET status = 'sent', provider_message_id = $messageId,
            sent_at = NOW(), updated_at = NOW()
      WHERE id = $id`,
    { bind: { id: ledgerId, messageId: providerMessageId ?? null } },
  );
}

/**
 * Mark a claim failed, which is the ONLY status the claim statement will move
 * back to `claimed`. A failed provider call therefore leaves a retryable state
 * with the attempt count preserved.
 */
export async function recordSendFailure(
  ledgerId: string,
  errorClass: string,
  errorDetail: string,
): Promise<void> {
  await sequelize.query(
    `UPDATE ${LEDGER_TABLE}
        SET status = 'failed', error_class = $errorClass,
            error_detail = $errorDetail, updated_at = NOW()
      WHERE id = $id`,
    { bind: { id: ledgerId, errorClass: errorClass.slice(0, 80), errorDetail } },
  );
}

/**
 * Manual recovery for a claim stranded by a crash. Moves `claimed` -> `failed`
 * so the next claim can retry. Deliberately NOT automatic and deliberately not
 * time-based: a stranded claim means we do not know whether the provider
 * accepted the message, and only a human who has checked the provider's own log
 * may resolve that. `WHERE status = 'claimed'` means this can never touch a
 * `sent` row, so no operator mistake can turn a delivered mail back into a
 * sendable one.
 */
export async function releaseClaim(
  idempotencyKey: string,
  operator: string,
  reason: string,
): Promise<{ released: boolean }> {
  const [rows]: any = await sequelize.query(
    `UPDATE ${LEDGER_TABLE}
        SET status = 'failed', error_class = 'ManuallyReleasedClaim',
            error_detail = $detail, updated_at = NOW()
      WHERE idempotency_key = $key AND status = 'claimed'
      RETURNING id`,
    { bind: { key: idempotencyKey, detail: `released by ${operator}: ${reason}` } },
  );
  const released = Boolean(rows?.[0]);
  logLedgerEvent('email_send_claim_released', released ? 'success' : 'failure', {
    idempotency_key: idempotencyKey,
    operator,
    reason,
    released,
  });
  return { released };
}

/**
 * Claim, send, record. The provider call happens only between a granted claim
 * and its outcome write; there is no other route to it in this module.
 */
export async function sendOnce(
  id: SendIdentity,
  send: () => Promise<ProviderResult>,
): Promise<SendOnceResult> {
  const claim = await claimSend(id);
  if (!claim.granted) {
    return { outcome: 'skipped', reason: claim.reason, idempotencyKey: claim.idempotencyKey };
  }

  let result: ProviderResult;
  try {
    result = await send();
  } catch (err: any) {
    const errorClass = err?.name || 'UnknownSendError';
    await recordSendFailure(claim.ledgerId, errorClass, String(err?.message ?? err));
    logLedgerEvent('email_send_failed', 'failure', {
      idempotency_key: claim.idempotencyKey,
      error_class: errorClass,
      attempts: claim.attempts,
    });
    return {
      outcome: 'failed',
      ledgerId: claim.ledgerId,
      idempotencyKey: claim.idempotencyKey,
      errorClass,
      error: String(err?.message ?? err),
    };
  }

  if (!result.ok) {
    const errorClass = result.errorClass || 'ProviderRejected';
    await recordSendFailure(claim.ledgerId, errorClass, result.error ?? 'provider reported not ok');
    logLedgerEvent('email_send_failed', 'failure', {
      idempotency_key: claim.idempotencyKey,
      error_class: errorClass,
      attempts: claim.attempts,
    });
    return {
      outcome: 'failed',
      ledgerId: claim.ledgerId,
      idempotencyKey: claim.idempotencyKey,
      errorClass,
      error: result.error ?? 'provider reported not ok',
    };
  }

  await recordSendSuccess(claim.ledgerId, result.messageId);
  logLedgerEvent('email_send_succeeded', 'success', {
    idempotency_key: claim.idempotencyKey,
    provider_message_id: result.messageId ?? null,
    attempts: claim.attempts,
    business_event_id: id.businessEventId,
  });
  return {
    outcome: 'sent',
    ledgerId: claim.ledgerId,
    idempotencyKey: claim.idempotencyKey,
    messageId: result.messageId,
  };
}

/** Structured stdout event, per the Observability Framework. No addresses. */
function logLedgerEvent(event: string, outcome: 'success' | 'failure', context: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'warn' : 'info',
    service: 'email-send-ledger',
    event,
    outcome,
    context,
  }));
}
