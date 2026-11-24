/**
 * Atomic dial reservation (VS1.5). Admits an outbound attempt BEFORE any network I/O, so concurrent
 * dispatches cannot race past the caps. Today voiceDialGuard COUNTS, then (after Synthflow accepts)
 * RECORDS, so N concurrent requests can all read "1 dial" and all dial (directive section 5).
 *
 * Mechanism, inside ONE short transaction (never held across provider I/O):
 *   1. pg_advisory_xact_lock on the tenant key, then on the destination key (fixed order, no deadlock).
 *   2. Same idempotency key already reserved? Return that reservation (idempotent replay).
 *   3. Count CONSERVATIVELY: held (unexpired lease), dispatching, accepted and ambiguous all count;
 *      the legacy voice_dial_log (Synthflow-era dials) counts too, so the cap spans both providers.
 *   4. Over a cap: deny with a reason. Otherwise insert status=held with a short lease.
 *
 * Lifecycle (conditional UPDATEs, so a transition happens at most once):
 *   held -> dispatching -> accepted                    (carrier accepted the call)
 *                       -> released                    (refused BEFORE acceptance: no call exists)
 *                       -> ambiguous                   (timeout / unknown: KEPT and COUNTED until a
 *                                                       reconciler resolves it; never auto-released)
 *   held -> expired                                    (lease ran out before dispatch; no call)
 *
 * Failure: any database error denies with `reservation_unavailable` (fail closed).
 */
import { QueryTypes, Transaction } from 'sequelize';
import { sequelize } from '../../../config/database';

export interface ReservationCaps {
  perDestination24h: number;
  perRoutePerDay: number | null;
  perTenantPerDay: number | null;
}
/** Legacy voiceDialGuard semantics: 2 dials per number per 24 h; no route/tenant caps until configured. */
export const DEFAULT_CAPS: ReservationCaps = { perDestination24h: 2, perRoutePerDay: null, perTenantPerDay: null };
export const LEASE_SECONDS = 120;

export interface ReserveInput {
  tenantId: string;
  idempotencyKey: string;
  destinationHash: string;
  /** The raw E.164, used ONLY to count legacy voice_dial_log rows inside the transaction; never stored. */
  destinationE164: string;
  routeId: string | null;
  purpose: string;
  caps: ReservationCaps;
}

export type ReserveResult =
  | { outcome: 'reserved'; reservationId: string; replay: boolean }
  | { outcome: 'denied'; reason: 'destination_cap' | 'route_cap' | 'tenant_cap' | 'reservation_unavailable'; detail?: string };

const COUNTED = `(status IN ('dispatching','accepted','ambiguous') OR (status = 'held' AND lease_expires_at > NOW()))`;

type Q = <T extends object>(sql: string, replacements: Record<string, unknown>, t: Transaction) => Promise<T[]>;
const q: Q = (sql, replacements, transaction) => sequelize.query(sql, { replacements, transaction, type: QueryTypes.SELECT }) as never;

export async function reserveDial(input: ReserveInput): Promise<ReserveResult> {
  try {
    return await sequelize.transaction(async (t) => {
      await q(`SELECT pg_advisory_xact_lock(hashtext(:k))`, { k: `voice:tenant:${input.tenantId}` }, t);
      await q(`SELECT pg_advisory_xact_lock(hashtext(:k))`, { k: `voice:dest:${input.destinationHash}` }, t);

      const existing = await q<{ id: string }>(
        `SELECT id FROM voice_dial_reservations WHERE tenant_id = :t AND idempotency_key = :k`,
        { t: input.tenantId, k: input.idempotencyKey }, t);
      if (existing.length) return { outcome: 'reserved', reservationId: existing[0].id, replay: true } as const;

      const [dest] = await q<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM voice_dial_reservations
          WHERE destination_hash = :h AND created_at > NOW() - INTERVAL '24 hours' AND ${COUNTED}`,
        { h: input.destinationHash }, t);
      // Legacy Synthflow-era dials count too. voice_dial_log is created lazily by voiceDialGuard, so it can be
      // absent on a fresh database. Postgres resolves table names at PARSE time, so a CASE around the count
      // still fails when the table is missing (CI caught this): check existence first, as its own query.
      const [exists] = await q<{ present: boolean }>(`SELECT to_regclass('public.voice_dial_log') IS NOT NULL AS present`, {}, t);
      let legacyCount = 0;
      if (exists.present) {
        const [legacy] = await q<{ n: number }>(
          `SELECT COUNT(*)::int AS n FROM voice_dial_log WHERE phone = :p AND created_at > NOW() - INTERVAL '24 hours'`,
          { p: input.destinationE164 }, t);
        legacyCount = legacy.n;
      }
      if (dest.n + legacyCount >= input.caps.perDestination24h) {
        return { outcome: 'denied', reason: 'destination_cap', detail: `${dest.n + legacyCount} in 24h` } as const;
      }
      if (input.caps.perRoutePerDay != null && input.routeId) {
        const [r] = await q<{ n: number }>(
          `SELECT COUNT(*)::int AS n FROM voice_dial_reservations WHERE route_id = :r AND created_at > NOW() - INTERVAL '24 hours' AND ${COUNTED}`,
          { r: input.routeId }, t);
        if (r.n >= input.caps.perRoutePerDay) return { outcome: 'denied', reason: 'route_cap' } as const;
      }
      if (input.caps.perTenantPerDay != null) {
        const [tn] = await q<{ n: number }>(
          `SELECT COUNT(*)::int AS n FROM voice_dial_reservations WHERE tenant_id = :t AND created_at > NOW() - INTERVAL '24 hours' AND ${COUNTED}`,
          { t: input.tenantId }, t);
        if (tn.n >= input.caps.perTenantPerDay) return { outcome: 'denied', reason: 'tenant_cap' } as const;
      }

      const [row] = await q<{ id: string }>(
        `INSERT INTO voice_dial_reservations (tenant_id, idempotency_key, destination_hash, route_id, purpose, status, lease_expires_at)
         VALUES (:t, :k, :h, :r, :p, 'held', NOW() + (:lease || ' seconds')::interval) RETURNING id`,
        { t: input.tenantId, k: input.idempotencyKey, h: input.destinationHash, r: input.routeId, p: input.purpose, lease: String(LEASE_SECONDS) }, t);
      return { outcome: 'reserved', reservationId: row.id, replay: false } as const;
    });
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', service: 'voice-gateway', event: 'voice_reservation_failed', outcome: 'failure',
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError', context: { message: err instanceof Error ? err.message : String(err) } }));
    // The error class (never the message, which can echo SQL values) travels with the denial so a
    // fail-closed block is diagnosable from the caller's log.
    return { outcome: 'denied', reason: 'reservation_unavailable', detail: err instanceof Error ? err.constructor.name : 'UnknownError' };
  }
}

type Transition = { from: string[]; to: 'dispatching' | 'accepted' | 'released' | 'ambiguous' | 'expired' };
export const TRANSITIONS: Record<'markDispatching' | 'markAccepted' | 'markRefused' | 'markAmbiguous' | 'expire', Transition> = {
  markDispatching: { from: ['held'], to: 'dispatching' },
  markAccepted: { from: ['dispatching', 'ambiguous'], to: 'accepted' },
  markRefused: { from: ['dispatching'], to: 'released' },
  markAmbiguous: { from: ['dispatching'], to: 'ambiguous' },
  expire: { from: ['held'], to: 'expired' },
};

/**
 * Apply one lifecycle transition. Returns true only if THIS call moved the row (a conditional UPDATE),
 * so a retried or duplicated transition is a no-op. markDispatching also requires an unexpired lease.
 */
export async function transitionReservation(reservationId: string, name: keyof typeof TRANSITIONS, callId?: string): Promise<boolean> {
  const tr = TRANSITIONS[name];
  const leaseClause = name === 'markDispatching' ? 'AND lease_expires_at > NOW()' : '';
  const rows = await sequelize.query<{ id: string }>(
    `UPDATE voice_dial_reservations SET status = :to, updated_at = NOW(), call_id = COALESCE(:c, call_id)
      WHERE id = :id AND status IN (:from) ${leaseClause} RETURNING id`,
    { replacements: { to: tr.to, c: callId ?? null, id: reservationId, from: tr.from }, type: QueryTypes.SELECT },
  );
  return rows.length === 1;
}
