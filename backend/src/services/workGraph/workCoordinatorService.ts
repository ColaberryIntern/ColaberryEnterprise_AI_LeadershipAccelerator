// ─── Work Coordinator ─────────────────────────────────────────────────────────
// ProofDesk Work Graph (Milestone 3). Lease acquire/release/heartbeat/expire over
// `resource_leases`. Collision detection is enforced at the DB level by a partial
// unique index on `resource_leases (resource_key) WHERE status = 'active'` (see
// ensureWorkGraphSchema.ts, proven against a real Postgres in T002) — this service
// is the application-side half: it attempts the insert, and when Postgres rejects
// a second concurrently-active lease on the same resource_key, it catches that
// unique-violation and returns a conflict rather than throwing, using the exact
// same catch-and-re-fetch technique workLedgerService.ts already uses for its own
// idempotency-key race (see that file's emitEvent()).

import { Op } from 'sequelize';
import { ResourceLease, AgentRun } from '../../models';
import type { AcquireLeaseInput } from '../../schemas/workGraphSchema';
import { dispatchTicketToAgent } from '../ticketAgentDispatcher';
import type { AgentExecutionResult } from '../agents/types';

const DEFAULT_LEASE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface AcquireLeaseResult {
  acquired: boolean;
  // `any` here (not `InstanceType<typeof ResourceLease>`): this is the plain
  // object shape callers (routes, tests) consume, not a live Sequelize instance
  // they're expected to call .update()/.reload() on — typing it as the model
  // class would falsely imply that contract. Mirrors workLedgerService.ts's own
  // return-shape convention for the same reason.
  lease: any;
  conflictWith?: any;
}

function isUniqueConstraintError(err: any): boolean {
  return (
    err?.name === 'SequelizeUniqueConstraintError' ||
    /duplicate key value violates unique constraint/i.test(err?.message || '')
  );
}

/** Marks any ACTIVE lease on resourceKey whose expires_at is in the past as
 * 'expired'. Lazy expiry — called at the top of acquireLease() for the key being
 * acquired, so a stale lease never blocks a new acquire, with no cron required. */
export async function expireStaleLeases(resourceKey: string): Promise<number> {
  const [affected] = await ResourceLease.update(
    { status: 'expired' },
    {
      where: {
        resource_key: resourceKey,
        status: 'active',
        expires_at: { [Op.lt]: new Date() },
      } as any,
    }
  );
  return affected;
}

/**
 * Acquires a lease on resourceKey. Idempotent on idempotencyKey: if a lease with
 * this exact idempotencyKey already exists, its CURRENT state is returned (no new
 * row is ever created for a repeated idempotencyKey) — same "duplicate key = no-op,
 * not an error" contract as workLedgerService.emitEvent(). Collision: if a
 * different, still-live active lease already holds resourceKey, returns
 * {acquired:false, conflictWith}. Never throws for a normal collision.
 */
export async function acquireLease(input: AcquireLeaseInput): Promise<AcquireLeaseResult> {
  await expireStaleLeases(input.resourceKey);

  const existingByIdempotencyKey = await ResourceLease.findOne({
    where: { idempotency_key: input.idempotencyKey },
  });
  if (existingByIdempotencyKey) {
    return {
      acquired: (existingByIdempotencyKey as any).status === 'active',
      lease: existingByIdempotencyKey,
    };
  }

  const ttlMs = input.ttlMs ?? DEFAULT_LEASE_TTL_MS;
  const expiresAt = new Date(Date.now() + ttlMs);

  try {
    const lease = await ResourceLease.create({
      resource_key: input.resourceKey,
      work_unit_id: input.workUnitId ?? null,
      run_id: input.runId ?? null,
      lease_owner: input.leaseOwner,
      status: 'active',
      expires_at: expiresAt,
      idempotency_key: input.idempotencyKey,
      before_state_version: input.beforeStateVersion ?? null,
    } as any);
    return { acquired: true, lease };
  } catch (err: any) {
    if (!isUniqueConstraintError(err)) throw err;

    // Race lost: either another acquire beat us to this resource_key (the
    // partial unique index), or a concurrent request reused this idempotency
    // key. Re-fetch the winner rather than surfacing the DB error to the caller.
    const winner =
      (await ResourceLease.findOne({ where: { idempotency_key: input.idempotencyKey } })) ??
      (await ResourceLease.findOne({ where: { resource_key: input.resourceKey, status: 'active' } }));

    return { acquired: false, lease: null, conflictWith: winner };
  }
}

/** Releases a lease. Idempotent: releasing an already-released/expired/cancelled
 * lease is a no-op, not an error. */
export async function releaseLease(
  leaseId: string,
  opts?: { cancellationToken?: string }
): Promise<{ released: boolean }> {
  // `as any` below: Sequelize's static findByPk() return type doesn't carry the
  // instance's declared attributes/methods without a generic hint this codebase's
  // AgentRun.ts-style models don't provide (see AgentRun.ts, same pattern) — cast
  // to reach `.status`/`.update()` on the real instance we already null-checked.
  const lease: any = await ResourceLease.findByPk(leaseId);
  if (!lease) return { released: false };
  if (lease.status !== 'active') return { released: false };

  if (opts?.cancellationToken && opts.cancellationToken !== lease.cancellation_token) {
    throw new Error('Invalid cancellation token for this lease');
  }

  await lease.update({ status: 'released', released_at: new Date() });
  return { released: true };
}

/** Extends a lease's expiry and records the heartbeat. No-op (returns false) if
 * the lease is not currently active — a dead lease cannot be revived by a
 * heartbeat, it must be re-acquired. */
export async function heartbeatLease(
  leaseId: string,
  opts?: { extendByMs?: number }
): Promise<{ heartbeat: boolean; expiresAt?: Date }> {
  const lease: any = await ResourceLease.findByPk(leaseId); // see releaseLease() for the `any` rationale
  if (!lease || lease.status !== 'active') return { heartbeat: false };

  const extendByMs = opts?.extendByMs ?? DEFAULT_LEASE_TTL_MS;
  const newExpiresAt = new Date(Date.now() + extendByMs);
  await lease.update({ heartbeat_at: new Date(), expires_at: newExpiresAt });
  return { heartbeat: true, expiresAt: newExpiresAt };
}

/**
 * Retry/handoff lineage (spec §8.3): finds the ticket's most recent failed
 * AgentRun and re-dispatches, wiring retry_of_run_id. Kept in this module (rather
 * than ticketAgentDispatcher.ts) because it's a coordination concern, not a
 * dispatch concern — dispatchTicketToAgent() itself is extended with an optional
 * retryOfRunId parameter (T008) that this function supplies.
 */
// `any` return (not InstanceType<typeof AgentRun>): callers only ever read `.id`
// off this - same rationale as AcquireLeaseResult.lease above.
export async function findMostRecentFailedRun(ticketId: string): Promise<any | null> {
  return AgentRun.findOne({
    where: { ticket_id: ticketId, status: 'failed' },
    order: [['created_at', 'DESC']],
  });
}

/**
 * Retries a ticket's most recent failed dispatch. Finds the last failed AgentRun
 * for the ticket and re-invokes dispatchTicketToAgent() with retryOfRunId set, so
 * the new run's agent_runs.retry_of_run_id correctly points back at the run being
 * retried (spec §8.3's retry/handoff lineage). Returns null - without dispatching
 * anything - when the ticket has no failed run to retry, so a caller can't
 * accidentally trigger a fresh (non-retry) dispatch by mistake through this path.
 */
export async function retryFailedRun(ticketId: string): Promise<AgentExecutionResult | null> {
  const mostRecentFailed = await findMostRecentFailedRun(ticketId);
  if (!mostRecentFailed) return null;
  return dispatchTicketToAgent(ticketId, { retryOfRunId: (mostRecentFailed as any).id });
}
