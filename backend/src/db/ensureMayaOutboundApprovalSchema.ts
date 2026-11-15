/**
 * ensureMayaOutboundApprovalSchema - the queue that holds every message Maya composes for a
 * real person until Ali approves that exact message.
 *
 * ## Why this is a NEW table and not `approval_requests`
 *
 * `approval_requests` already exists and looks like the obvious home. It is disqualified.
 * `services/workLedger/approvalRequestTimeoutJob.ts` selects every `pending` row past its
 * `expires_at` and calls `approveApprovalRequest(row.id, 'system:auto_approve_timeout')`. It is
 * scheduled in `schedulerService.ts` as a bare `cron.schedule('*\/15 * * * *', ...)` with no flag
 * guard, scoped by no agent, no action and no channel. The production damage is already on
 * record in `services/reese/reeseOutreachHolds.ts`: 851 replayed DMs to 52 students between
 * 7 Oct and 12 Nov 2026, one student 37 times.
 *
 * A queue whose purpose is "nothing leaves without a human decision" cannot live in a table that
 * has a timer which writes `approved`.
 *
 * ## The invariant, enforced in the SCHEMA and not only in the service
 *
 *   > No message Maya composes for a real person is delivered without Ali deciding that exact
 *   > message. Not by a retry, a replay, a cron, a timeout, a second tool call, or a bulk button.
 *
 * `chk_moa_decider_is_a_person` makes that a constraint rather than a convention: `decided_by`
 * may never begin with `system:`. If a future sweep, a retry, or a well-meaning helper ever
 * tries to decide a row on the system's behalf, the INSERT or UPDATE fails at the database
 * rather than sending. The status vocabulary below contains no `auto_approved` value for the
 * same reason - there is no word for it, so no code can write it.
 *
 * Expiry is the one thing a timer may do, and it may only move `pending_approval` to `expired`.
 * `expired` is terminal and not deliverable. That shape follows `proposalCleanupService.ts`.
 *
 * ## Why the row holds the rendered BODY
 *
 * A queue row is only an approval of a message if the row IS the message. `sendDocument`'s real
 * HTML is composed inside `emailService.sendAdmissionsDocument`, so a row holding a summary
 * would read as "approved" while the bytes Ali never saw were rendered at delivery time.
 * `body` holds exactly what the provider will receive, `body_hash` pins it, and the approve path
 * re-hashes before sending and refuses if anything moved. Anything that cannot be rendered
 * before send time does not belong in this queue at all; that is why campaign enrolment is
 * `off` rather than queued.
 *
 * ## PII
 *
 * `recipient_ref` is the opaque id every log line and API response uses (`lead:<uuid>`), never
 * an email address. `recipient_address` exists because a queue that cannot address the message
 * cannot deliver it, and it is read only by the delivery path; the admin API masks it.
 */

import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { normalizeNameRows } from './ensureAgentDomainProjectSchema';

export const REQUIRED_TABLES: ReadonlyArray<string> = ['maya_outbound_approvals'];

const T = 'maya_outbound_approvals';

/**
 * The statuses this queue knows about. There is deliberately NO `auto_approved`, and a test
 * asserts that absence, because a vocabulary is the first place an exception gets added.
 *
 *  pending_approval  composed, stored, waiting on a person. The only deliverable-from state.
 *  approved          a named human decided. Delivery is in flight or about to be.
 *  sending           claimed by the delivery path, so a second click cannot double-send.
 *  sent              delivered once.
 *  failed            delivery attempted and the provider refused. Terminal; needs a new row.
 *  rejected          a named human said no.
 *  withdrawn         the composing side pulled it back before a decision.
 *  expired           nobody decided within the window. NOT deliverable. The only state a timer
 *                    may write, and it may only write it over `pending_approval`.
 */
export const APPROVAL_STATUSES: ReadonlyArray<string> = [
  'pending_approval',
  'approved',
  'sending',
  'sent',
  'failed',
  'rejected',
  'withdrawn',
  'expired',
];

export const REQUIRED_COLUMNS: ReadonlyArray<string> = [
  `${T}.id`,
  // WHO it is for. `recipient_ref` is the opaque id used in every log and API response.
  `${T}.recipient_ref`,
  `${T}.recipient_address`,
  `${T}.recipient_display`,
  // WHAT channel it would leave by. One row is one message on one channel.
  `${T}.channel`,
  // THE MESSAGE ITSELF, as it will be transmitted.
  `${T}.subject`,
  `${T}.body`,
  `${T}.body_hash`,
  // WHO COMPOSED IT and UNDER WHICH CAPABILITY. The capability is what the console dial governs.
  `${T}.composed_by`,
  `${T}.capability`,
  // TRACING. One id from the chat turn that composed it through to the delivery log line.
  `${T}.correlation_id`,
  // REPLAY SAFETY. Unique, so re-running the composing tool adds no second row.
  `${T}.idempotency_key`,
  // THE DECISION.
  `${T}.status`,
  `${T}.decided_by`,
  `${T}.decided_at`,
  `${T}.decision_note`,
  `${T}.delivered_at`,
  `${T}.failure_reason`,
  // WHEN IT STOPS WAITING. Expiry may only write `expired`, never `approved`.
  `${T}.expires_at`,
];

export const REQUIRED_INDEXES: ReadonlyArray<string> = [
  'uq_moa_idempotency_key',
  'idx_moa_status_created',
  'idx_moa_pending_expiry',
  'idx_moa_correlation',
];

export const REQUIRED_CHECKS: ReadonlyArray<string> = [
  'chk_moa_status_is_known',
  'chk_moa_decider_is_a_person',
  'chk_moa_message_is_present',
];

const STATUS_LIST = APPROVAL_STATUSES.map((s) => `'${s}'`).join(', ');

const STATEMENTS: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS ${T} (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     recipient_ref TEXT NOT NULL,
     recipient_address TEXT NOT NULL,
     recipient_display TEXT,
     channel TEXT NOT NULL,
     subject TEXT,
     body TEXT NOT NULL,
     body_hash TEXT NOT NULL,
     composed_by TEXT NOT NULL,
     capability TEXT NOT NULL,
     correlation_id TEXT NOT NULL,
     idempotency_key TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'pending_approval',
     decided_by TEXT,
     decided_at TIMESTAMPTZ,
     decision_note TEXT,
     delivered_at TIMESTAMPTZ,
     failure_reason TEXT,
     expires_at TIMESTAMPTZ NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

     -- The vocabulary. No 'auto_approved' exists, so no code can write one.
     CONSTRAINT chk_moa_status_is_known CHECK (status IN (${STATUS_LIST})),

     -- THE INVARIANT, AS A CONSTRAINT.
     --
     -- A decision is a person's. 'system:auto_approve_timeout' is the exact string the
     -- unguarded sweep on approval_requests writes, and the prefix is banned rather than that
     -- one literal so no sibling value ('system:retry', 'system:replay') can slip past. A
     -- row that breaks this cannot exist even if a future caller skips the service contract.
     CONSTRAINT chk_moa_decider_is_a_person CHECK (
       decided_by IS NULL
       OR (length(btrim(decided_by)) > 0 AND decided_by NOT LIKE 'system:%')
     ),

     -- A row is an approval of a MESSAGE, so it must carry one. An empty body would let a
     -- summary-shaped row pass review while the real bytes were rendered at delivery.
     CONSTRAINT chk_moa_message_is_present CHECK (
       length(btrim(body)) > 0
       AND length(btrim(body_hash)) > 0
       AND length(btrim(recipient_ref)) > 0
       AND length(btrim(recipient_address)) > 0
       AND length(btrim(channel)) > 0
       AND length(btrim(capability)) > 0
       AND length(btrim(correlation_id)) > 0
       AND length(btrim(idempotency_key)) > 0
     )
   )`,
  // THE REPLAY GUARD. Composing the same message twice is one row, not two, so a retried tool
  // call cannot produce a second thing for Ali to approve or a second thing to send.
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_moa_idempotency_key ON ${T} (idempotency_key)`,
  // "What is waiting for me" is the question the review page asks, oldest first.
  `CREATE INDEX IF NOT EXISTS idx_moa_status_created ON ${T} (status, created_at)`,
  // The expire-only sweep's working set. Partial, so it cannot be used to find anything to send.
  `CREATE INDEX IF NOT EXISTS idx_moa_pending_expiry ON ${T} (expires_at)
     WHERE status = 'pending_approval'`,
  // "Show me this chat turn end to end" is the question an incident asks.
  `CREATE INDEX IF NOT EXISTS idx_moa_correlation ON ${T} (correlation_id)`,
];

/** Net-new, so it reverts whole. This module owns the table; a module revert is dropping it. */
export const ROLLBACK_STATEMENTS: ReadonlyArray<string> = [
  `DROP TABLE IF EXISTS ${T}`,
];

export async function ensureMayaOutboundApprovalSchema(): Promise<void> {
  for (const statement of STATEMENTS) {
    try {
      await sequelize.query(statement);
    } catch (err: unknown) {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        service: 'maya',
        event: 'maya_outbound_approval_schema_statement_failed',
        outcome: 'failure',
        error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
        context: { message: err instanceof Error ? err.message : String(err) },
      }));
    }
  }
}

/** NAMED bind plus `normalizeNameRows`, the shape proven against this driver. */
async function readNames(sql: string, names: ReadonlyArray<string>): Promise<string[]> {
  const rows = await sequelize.query(sql, {
    bind: { names: names as string[] },
    type: QueryTypes.SELECT,
  });
  return normalizeNameRows(rows);
}

/**
 * Prove the DDL actually ran.
 *
 * `ensureMayaOutboundApprovalSchema` swallows every failure into a warn, so it resolves
 * identically on total success and total failure, and `CREATE TABLE IF NOT EXISTS` is a no-op
 * against an existing table. Asserting post-conditions against `information_schema` is the only
 * way this distinguishes the two. For this table the stakes are higher than usual: a missing
 * `chk_moa_decider_is_a_person` would be invisible until the day something tried to use it.
 */
export async function assertMayaOutboundApprovalSchema(): Promise<void> {
  const problems: string[] = [];

  const tables = await readNames(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($names)`,
    REQUIRED_TABLES,
  );
  for (const t of REQUIRED_TABLES) if (!tables.includes(t)) problems.push(`missing table ${t}`);

  if (problems.length === 0) {
    const cols = await readNames(
      `SELECT table_name || '.' || column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($names)`,
      REQUIRED_TABLES,
    );
    for (const c of REQUIRED_COLUMNS) if (!cols.includes(c)) problems.push(`missing column ${c}`);

    const idx = await readNames(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = ANY($names)`,
      REQUIRED_TABLES,
    );
    for (const i of REQUIRED_INDEXES) if (!idx.includes(i)) problems.push(`missing index ${i}`);

    const checks = await readNames(
      `SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND table_name = ANY($names)
          AND constraint_type = 'CHECK'`,
      REQUIRED_TABLES,
    );
    for (const c of REQUIRED_CHECKS) if (!checks.includes(c)) problems.push(`missing constraint ${c}`);
  }

  if (problems.length > 0) {
    throw new Error(`SchemaInvariantViolation: ${problems.join('; ')}`);
  }
}

export interface GuardedMayaOutboundApprovalSchemaResult {
  ok: boolean;
  error_class?: string;
}

/** Boot entry point. CANNOT REJECT, the same contract its siblings have. */
export async function ensureMayaOutboundApprovalSchemaGuarded(
): Promise<GuardedMayaOutboundApprovalSchemaResult> {
  try {
    await ensureMayaOutboundApprovalSchema();
    await assertMayaOutboundApprovalSchema();
    return { ok: true };
  } catch (err: unknown) {
    const error_class = err instanceof Error ? err.constructor.name : 'UnknownError';
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'maya',
      event: 'maya_outbound_approval_schema_unavailable',
      outcome: 'failure',
      error_class,
      context: { message: err instanceof Error ? err.message : String(err) },
    }));
    return { ok: false, error_class };
  }
}

/** Exported for the containment test, so the SQL it scans is the SQL that runs. */
export const SCHEMA_STATEMENTS: ReadonlyArray<string> = STATEMENTS;
