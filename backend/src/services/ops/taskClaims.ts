/**
 * taskClaims — take, release and read leases on a task.
 *
 * THE RACE IS RESOLVED IN POSTGRES, NOT HERE.
 *
 * The obvious implementation is "read the claim, if it is free then write one". Two workers can
 * interleave between the read and the write and both believe they won, which is precisely the
 * failure this module exists to prevent — and it would fail rarely enough to look like it works.
 *
 * So `claim` is a single INSERT ... ON CONFLICT DO UPDATE whose WHERE clause carries the whole
 * condition: take it if nobody holds it, or if the holder's lease has expired, or if the holder is
 * me (re-claiming is a renewal, not a conflict). The statement either affects one row or none, and
 * that is the verdict. There is no window.
 *
 * EXPIRY IS NOT OPTIONAL. A lease without one is a lock, and a lock held by a session that died is
 * a ticket nobody can ever work again. Every claim carries a TTL and the default is deliberately
 * short: a worker that is still going renews, and a worker that crashed stops blocking the queue
 * within the hour.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';

export const DEFAULT_TTL_MINUTES = 60;

export interface TaskClaim {
  task_key: string;
  holder: string;
  purpose: string | null;
  claimed_at: string;
  expires_at: string;
  note: string | null;
}

export interface ClaimResult {
  ok: boolean;
  claim: TaskClaim | null;
  /** Set when ok is false: who holds it and until when, so the caller can say so rather than retry blindly. */
  heldBy?: string;
  heldUntil?: string;
}

/**
 * Take or renew a lease.
 *
 * Returns ok:false WITH the current holder rather than throwing, because "someone else has this"
 * is an ordinary outcome of a queue being worked in parallel, not an error. A caller that throws
 * on it ends up retrying into the same wall.
 */
export async function claim(
  taskKey: string,
  holder: string,
  opts: { ttlMinutes?: number; purpose?: string; note?: string } = {},
): Promise<ClaimResult> {
  const ttl = Math.max(1, opts.ttlMinutes ?? DEFAULT_TTL_MINUTES);
  const rows = await sequelize.query<TaskClaim>(
    `INSERT INTO ops_task_claims (task_key, holder, purpose, claimed_at, expires_at, note, released_at)
     VALUES ($1, $2, $3, now(), now() + ($4 || ' minutes')::interval, $5, NULL)
     ON CONFLICT (task_key) DO UPDATE
       SET holder = EXCLUDED.holder,
           purpose = EXCLUDED.purpose,
           claimed_at = now(),
           expires_at = EXCLUDED.expires_at,
           note = EXCLUDED.note,
           released_at = NULL
     WHERE ops_task_claims.released_at IS NOT NULL
        OR ops_task_claims.expires_at <= now()
        OR ops_task_claims.holder = EXCLUDED.holder
     RETURNING task_key, holder, purpose, claimed_at::text, expires_at::text, note`,
    { bind: [taskKey, holder, opts.purpose ?? null, String(ttl), opts.note ?? null], type: QueryTypes.SELECT },
  );

  if (rows.length) return { ok: true, claim: rows[0] };

  // No row came back, so somebody else holds a live lease. Say who.
  const current = await get(taskKey);
  return {
    ok: false,
    claim: null,
    heldBy: current?.holder,
    heldUntil: current?.expires_at,
  };
}

/**
 * Give it back.
 *
 * Only the holder may release, so a second worker cannot free a lease it does not own and then
 * take it. Returns false when the caller is not the holder, which the caller should treat as
 * information rather than as failure.
 */
export async function release(taskKey: string, holder: string): Promise<boolean> {
  const rows = await sequelize.query<{ task_key: string }>(
    `UPDATE ops_task_claims SET released_at = now(), expires_at = now()
      WHERE task_key = $1 AND holder = $2 AND released_at IS NULL
      RETURNING task_key`,
    { bind: [taskKey, holder], type: QueryTypes.SELECT },
  );
  return rows.length > 0;
}

/** The live claim on a task, or null. An expired or released row is not a claim. */
export async function get(taskKey: string): Promise<TaskClaim | null> {
  const rows = await sequelize.query<TaskClaim>(
    `SELECT task_key, holder, purpose, claimed_at::text, expires_at::text, note
       FROM ops_task_claims
      WHERE task_key = $1 AND released_at IS NULL AND expires_at > now()`,
    { bind: [taskKey], type: QueryTypes.SELECT },
  );
  return rows[0] ?? null;
}

/** Every live claim. Used to subtract claimed work from a queue before it is handed out. */
export async function listLive(): Promise<TaskClaim[]> {
  return sequelize.query<TaskClaim>(
    `SELECT task_key, holder, purpose, claimed_at::text, expires_at::text, note
       FROM ops_task_claims
      WHERE released_at IS NULL AND expires_at > now()
      ORDER BY expires_at ASC`,
    { type: QueryTypes.SELECT },
  );
}

/**
 * Split a list of work orders into what this holder may work and what is already spoken for.
 *
 * FAIL-OPEN, deliberately, and this is a judgement worth stating. If the claims table cannot be
 * read, everything is treated as available. The alternative - treating everything as claimed -
 * would silently empty the queue and look exactly like "there is no work today", which is the
 * failure mode that wastes a day. A duplicated effort is visible and recoverable; a queue that
 * quietly reports nothing is neither.
 */
export async function partitionByClaim<T extends { id: string }>(
  orders: T[],
  holder: string,
): Promise<{ available: T[]; claimed: Array<T & { heldBy: string; heldUntil: string }> }> {
  let live: TaskClaim[] = [];
  try {
    live = await listLive();
  } catch (err: any) {
    console.warn('[claims] could not read claims, treating all work as available:', err?.message);
    return { available: orders, claimed: [] };
  }
  const byKey = new Map(live.map((c) => [c.task_key, c]));
  const available: T[] = [];
  const claimed: Array<T & { heldBy: string; heldUntil: string }> = [];
  for (const o of orders) {
    const c = byKey.get(o.id);
    if (c && c.holder !== holder) claimed.push({ ...o, heldBy: c.holder, heldUntil: c.expires_at });
    else available.push(o);
  }
  return { available, claimed };
}
