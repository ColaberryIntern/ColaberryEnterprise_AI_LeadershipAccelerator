import { randomUUID } from 'crypto';
import SystemSetting from '../../models/SystemSetting';
import { acquireLease, heartbeatLease, releaseLease } from '../workGraph/workCoordinatorService';

// /inbox-zero operator session: ONE durable lease + ONE cursor.
//
// The lease is REUSED from the ProofDesk Work Graph (`resource_leases` +
// workCoordinatorService). That table already carries the partial unique index
// `(resource_key) WHERE status = 'active'` (ensureWorkGraphSchema.ts), so
// "exactly one active operator" is enforced by Postgres, not by this file.
// This matters because the rest of the inbox pipeline has NO cross-process
// guard at all — inboxScheduler's only lock is a module-scope boolean — so a
// second Claude Code tab, or a second backend container, would otherwise be
// free to double-execute an approval.
//
// The cursor is the only genuinely new state, and it lives in system_settings
// under INBOX_ZERO_OPERATOR_CURSOR_KEY, matching the precedent
// system_settings['inbox_cos_sync_state'] (inboxSyncService.ts). resource_leases
// must not grow a cursor column: it is a shared subsystem.
//
// Two rules the plan auditor forced, both easy to get wrong:
//   1. idempotency_key is a FRESH UUID per acquisition attempt, never the tab
//      id. acquireLease() short-circuits on idempotency_key and returns
//      `acquired: status === 'active'`, and the column is uniquely indexed, so
//      reusing the tab id would make a tab that once released its lease unable
//      to EVER acquire again — which is exactly what `/inbox-zero resume` needs.
//      The tab identity goes in lease_owner, which carries no uniqueness.
//   2. The cursor advances ONLY when the caller reports durable processing
//      succeeded. A failed refresh must not move it, or the items that failed
//      to process are silently skipped forever.

export const INBOX_ZERO_OPERATOR_RESOURCE_KEY = 'inbox_zero_operator';
export const INBOX_ZERO_OPERATOR_CURSOR_KEY = 'inbox_zero_operator_cursor';
// 5 minutes: matches the operator-view refresh cadence. A tab that stops
// heartbeating for one full refresh window is treated as gone, and the next
// acquire reaps it lazily (expireStaleLeases runs inside acquireLease).
export const OPERATOR_LEASE_TTL_MS = 5 * 60 * 1000;

const SERVICE = 'inboxZeroOperatorSession';

export interface OperatorCursor {
  cursor_at: string | null;
  advanced_at: string | null;
  advanced_by: string | null;
}

export interface OperatorIncumbent {
  leaseId: string;
  leaseOwner: string;
  expiresAt: Date | null;
}

export interface StartOperatorSessionResult {
  acquired: boolean;
  leaseId: string | null;
  expiresAt: Date | null;
  incumbent: OperatorIncumbent | null;
  cursor: OperatorCursor;
}

export interface AdvanceCursorInput {
  to: Date;
  processingSucceeded: boolean;
  advancedBy: string;
}

const EMPTY_CURSOR: OperatorCursor = { cursor_at: null, advanced_at: null, advanced_by: null };

function log(event: string, outcome: 'success' | 'failure' | 'partial', context: Record<string, unknown>, errorClass?: string): void {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: outcome === 'failure' ? 'error' : 'info',
      service: SERVICE,
      event,
      outcome,
      ...(errorClass ? { error_class: errorClass } : {}),
      context,
    }),
  );
}

// ─── Lease ────────────────────────────────────────────────────────────────────

/**
 * Acquire the single operator lease for this tab. Returns `acquired:false` and
 * names the incumbent when another tab (or container) holds it — never throws
 * for a normal collision. The same tab identity may call this again after
 * `stopOperatorSession` and succeed; see rule 1 in the header.
 */
export async function startOperatorSession(tabIdentity: string): Promise<StartOperatorSessionResult> {
  const owner = tabIdentity.trim();
  if (!owner) throw new Error('startOperatorSession: tabIdentity is required');

  const result = await acquireLease({
    resourceKey: INBOX_ZERO_OPERATOR_RESOURCE_KEY,
    leaseOwner: owner,
    idempotencyKey: `inbox-zero:${randomUUID()}`,
    ttlMs: OPERATOR_LEASE_TTL_MS,
  });

  const cursor = await readOperatorCursor();

  if (!result.acquired) {
    const incumbent = toIncumbent(result.conflictWith);
    log('operator_lease_refused', 'partial', { tab: owner, incumbent: incumbent?.leaseOwner ?? null });
    return { acquired: false, leaseId: null, expiresAt: null, incumbent, cursor };
  }

  log('operator_lease_acquired', 'success', { tab: owner, lease_id: result.lease.id });
  return {
    acquired: true,
    leaseId: result.lease.id,
    expiresAt: result.lease.expires_at ?? null,
    incumbent: null,
    cursor,
  };
}

/** Extend the lease by one refresh window. Returns `heartbeat:false` if the
 * lease is no longer active — the caller must re-acquire, not keep going. */
export async function heartbeatOperatorSession(leaseId: string): Promise<{ heartbeat: boolean; expiresAt?: Date }> {
  const r = await heartbeatLease(leaseId, { extendByMs: OPERATOR_LEASE_TTL_MS });
  if (!r.heartbeat) log('operator_heartbeat_lost', 'failure', { lease_id: leaseId }, 'LeaseExpired');
  return r;
}

/** Release the lease. Idempotent: releasing a lease that is already released or
 * expired is a no-op. The cursor is deliberately NOT touched here — it is the
 * resume point for the next session. */
export async function stopOperatorSession(leaseId: string): Promise<{ released: boolean }> {
  const r = await releaseLease(leaseId);
  log('operator_lease_released', r.released ? 'success' : 'partial', { lease_id: leaseId, released: r.released });
  return r;
}

function toIncumbent(row: any): OperatorIncumbent | null {
  if (!row) return null;
  return {
    leaseId: row.id,
    leaseOwner: row.lease_owner,
    expiresAt: row.expires_at ?? null,
  };
}

// ─── Cursor ───────────────────────────────────────────────────────────────────

export async function readOperatorCursor(): Promise<OperatorCursor> {
  try {
    const setting = await SystemSetting.findOne({ where: { key: INBOX_ZERO_OPERATOR_CURSOR_KEY } });
    const value = (setting?.value ?? null) as Partial<OperatorCursor> | null;
    if (!value) return { ...EMPTY_CURSOR };
    return {
      cursor_at: value.cursor_at ?? null,
      advanced_at: value.advanced_at ?? null,
      advanced_by: value.advanced_by ?? null,
    };
  } catch (err: any) {
    log('operator_cursor_read_failed', 'failure', { message: err?.message }, err?.name || 'UnknownError');
    return { ...EMPTY_CURSOR };
  }
}

/**
 * Advance the cursor. A no-op when `processingSucceeded` is false — a failed
 * refresh must never skip the rows it failed on. Also a no-op if `to` is not
 * later than the stored cursor, so a stale or replayed refresh cannot move
 * the cursor backwards.
 */
export async function advanceOperatorCursor(input: AdvanceCursorInput): Promise<{ advanced: boolean; cursor: OperatorCursor }> {
  const current = await readOperatorCursor();

  if (!input.processingSucceeded) {
    log('operator_cursor_held', 'partial', { reason: 'processing_failed', cursor_at: current.cursor_at });
    return { advanced: false, cursor: current };
  }

  const currentMs = current.cursor_at ? Date.parse(current.cursor_at) : Number.NEGATIVE_INFINITY;
  if (input.to.getTime() <= currentMs) {
    log('operator_cursor_held', 'partial', { reason: 'not_later_than_current', cursor_at: current.cursor_at });
    return { advanced: false, cursor: current };
  }

  const next: OperatorCursor = {
    cursor_at: input.to.toISOString(),
    advanced_at: new Date().toISOString(),
    advanced_by: input.advancedBy,
  };

  const [setting] = await SystemSetting.findOrCreate({
    where: { key: INBOX_ZERO_OPERATOR_CURSOR_KEY },
    defaults: { key: INBOX_ZERO_OPERATOR_CURSOR_KEY, value: next, updated_by: null } as any,
  });
  await setting.update({ value: next });

  log('operator_cursor_advanced', 'success', { from: current.cursor_at, to: next.cursor_at, by: input.advancedBy });
  return { advanced: true, cursor: next };
}
