/**
 * Which Zoom host a persistent video room's link is minted under.
 *
 * ── THE FAILURE THIS EXISTS FOR ────────────────────────────────────────────────
 * A Zoom user may host one meeting at a time, and the limit is per user, not per
 * account. Every room link was minted with no host, so `zoomService.createMeeting`
 * fell back to the single `ZOOM_HOST_EMAIL` for all of them. Two rooms therefore
 * held two year-long meetings belonging to one identity, and the second could not
 * open while the first was live — you had to end one call to start the other.
 *
 * The host pool (`zoomHostRegistry`) was built to answer exactly this and was wired
 * only to the practice-slot path. This module is the missing consumer for rooms.
 *
 * ── RESERVE BEFORE MINTING, NOT AFTER ──────────────────────────────────────────
 * The host is written onto the room BEFORE Zoom is called, inside a transaction that
 * holds an advisory lock. Choosing a host, calling Zoom, and then recording what we
 * chose would leave the choice unobserved for the length of an external API call —
 * and two rooms provisioned together (`ensureInternshipMeetingRooms` mints both in a
 * `Promise.all`) would each read a usage count that did not yet include the other and
 * both pick the same host. That is the original bug, reintroduced by the fix for it.
 *
 * A reservation that never gets a link is harmless and deliberate: the room is simply
 * assigned a host, and the next attempt reuses the same one. Reusing it is what lets
 * the idempotency ledger reconcile a lost response against the host the first attempt
 * actually used.
 *
 * ── AN EMPTY POOL IS NORMAL, AND MUST CHANGE NOTHING ───────────────────────────
 * Until an operator registers and verifies a second host, `allocatableHostEmails`
 * returns `[]`. That is not "no capacity" — it is the state every install starts in,
 * and it must behave exactly as the platform did before this module existed. So an
 * empty pool returns `null`, no reservation is written, and the caller passes no host,
 * which is the pre-existing fallback to `ZOOM_HOST_EMAIL`. Merging this file changes
 * no behavior at all until a host is added.
 *
 * ── THIS MODULE HOLDS NO SECRETS ───────────────────────────────────────────────
 * Host addresses only. A host in a separate Zoom account carries its own credential,
 * referenced by name in the registry and never read here.
 */

import { env } from '../../config/env';
import { allocatableHostEmails } from './zoomHostRegistry';

/**
 * Rooms ask the pool for this purpose. A host registered with the registry's default
 * purpose (`'any'`) serves rooms and practice slots both, so the operator script needs
 * no new flag for this to work.
 */
export const ROOM_HOST_PURPOSE = 'room';

/** Where the chosen host is recorded on the room. */
export const ROOM_HOST_METADATA_KEY = 'zoom_host_email';

/**
 * One stable key. Every room-host reservation serializes on it.
 *
 * A global lock is the right grain here despite sounding coarse: a room reserves a
 * host once in its lifetime, so contention is near zero, and the alternative (locking
 * the rows a usage count is derived from) is both slower to reason about and easy to
 * get subtly wrong.
 *
 * Namespaced through `hashtext` like every other advisory lock in this codebase
 * (`gameRoomStore`, `projectDiscoveryCallRequest`). A bare integer shares one global
 * lock space with those hashes and could collide with one by coincidence — which would
 * surface as two unrelated features mysteriously blocking each other.
 */
const ALLOCATION_LOCK_KEY = 'zoom:room_host_allocation';

/** Lazy so importing this module never constructs the ORM. */
async function db() {
  const { sequelize } = await import('../../config/database');
  return sequelize;
}

const normalize = (email: unknown): string => String(email ?? '').trim().toLowerCase();

/**
 * The host in `pool` carrying the fewest rooms, or `null` for an empty pool.
 *
 * Pure, because this is the rule worth testing and the database around it is not.
 * `pool` arrives in the registry's priority order, and ties are broken by that order,
 * so the first-registered host fills first and allocation is reproducible rather than
 * dependent on which row Postgres happened to return first.
 *
 * Usage of a host that is not in the pool is ignored: a disabled or unverified host
 * cannot be chosen, so what it already carries cannot change the answer.
 */
export function pickLeastLoaded(
  pool: readonly string[],
  usage: ReadonlyMap<string, number>,
): string | null {
  let best: string | null = null;
  let bestCount = Number.POSITIVE_INFINITY;
  for (const host of pool) {
    const count = usage.get(normalize(host)) ?? 0;
    if (count < bestCount) {
      best = host;
      bestCount = count;
    }
  }
  return best;
}

/**
 * How many rooms each host already carries a minted link for.
 *
 * A room minted before this module existed has no recorded host, and its link belongs
 * to the configured default. Counting those against the default is what stops the very
 * first allocation from handing a new room the one host that is already busy — the
 * exact collision this is meant to end.
 *
 * Only rooms that actually hold a link are counted. A reservation with no link yet is
 * also counted, because the host is spoken for the moment it is reserved; otherwise two
 * reservations taken moments apart would both look free.
 */
export async function roomHostUsage(transaction?: unknown): Promise<Map<string, number>> {
  const [rows] = await (await db()).query(
    `SELECT COALESCE(NULLIF(LOWER(metadata->>'${ROOM_HOST_METADATA_KEY}'), ''), :fallback) AS host,
            COUNT(*)::int AS n
       FROM community_rooms
      WHERE meeting_link IS NOT NULL
         OR NULLIF(metadata->>'${ROOM_HOST_METADATA_KEY}', '') IS NOT NULL
      GROUP BY 1`,
    {
      replacements: { fallback: normalize(env.zoomHostEmail) },
      ...(transaction ? { transaction: transaction as never } : {}),
    },
  ) as [Array<{ host: string; n: number }>, unknown];
  const out = new Map<string, number>();
  for (const r of rows || []) out.set(normalize(r.host), Number(r.n) || 0);
  return out;
}

async function readReservation(roomId: string, transaction: unknown): Promise<string | null> {
  const [rows] = await (await db()).query(
    `SELECT NULLIF(metadata->>'${ROOM_HOST_METADATA_KEY}', '') AS host
       FROM community_rooms WHERE id = :id`,
    { replacements: { id: roomId }, transaction: transaction as never },
  ) as [Array<{ host: string | null }>, unknown];
  const host = rows?.[0]?.host;
  return host ? normalize(host) : null;
}

async function writeReservation(roomId: string, hostEmail: string, transaction: unknown): Promise<void> {
  await (await db()).query(
    `UPDATE community_rooms
        SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('${ROOM_HOST_METADATA_KEY}', :host),
            updated_at = NOW()
      WHERE id = :id`,
    { replacements: { id: roomId, host: hostEmail }, transaction: transaction as never },
  );
}

/**
 * The host this room's link must be minted under, or `null` to use the configured
 * default.
 *
 * IDEMPOTENT. A room that already holds a reservation gets the same answer forever,
 * which is what keeps its join link stable and lets a reconcile ask the right host.
 * Calling this twice reserves once.
 *
 * NEVER THROWS, AND THAT IS THE POINT. This sits on the first-join path: before it
 * existed, joining a room could not fail because of the host registry, and it still
 * must not. A registry read that errors degrades to `null` — the configured default
 * host, which is exactly where every link was minted before this feature. Letting the
 * error escape would turn a capacity optimisation into a reason a student cannot get
 * into a call, which is a strictly worse failure than the one being fixed.
 *
 * The degraded path is logged rather than swallowed: a pool that is silently never
 * consulted looks identical to a pool that is working, and the whole collision would
 * come back invisibly.
 */
export async function reserveRoomHost(roomId: string): Promise<string | null> {
  if (!roomId) return null;
  try {
    // Read the pool OUTSIDE the lock: it is a plain registry read, and holding the
    // allocation lock across it would serialize every caller behind it for no gain.
    const pool = await allocatableHostEmails(ROOM_HOST_PURPOSE);
    if (pool.length === 0) return null;

    const sequelize = await db();
    return await sequelize.transaction(async (tx) => {
      await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:k))', {
        replacements: { k: ALLOCATION_LOCK_KEY },
        transaction: tx,
      });
      const already = await readReservation(roomId, tx);
      if (already) return already;

      const chosen = pickLeastLoaded(pool, await roomHostUsage(tx));
      if (chosen) await writeReservation(roomId, chosen, tx);
      return chosen;
    });
  } catch (err: unknown) {
    const e = err as { constructor?: { name?: string }; message?: string };
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'backend',
      event: 'room_host_reservation_failed',
      outcome: 'failure',
      error_class: e?.constructor?.name ?? 'Error',
      context: { room_id: roomId, degraded_to: 'default_host' },
    }));
    return null;
  }
}

export interface SharedHostReport {
  host_email: string;
  room_count: number;
  rooms: string[];
}

/**
 * Rooms that would collide: any host carrying more than one room with a link.
 *
 * Exists so the condition is observable rather than discovered by a person whose call
 * will not start. Expected to be non-empty while the pool is smaller than the number
 * of rooms — which is a capacity fact for an operator to act on, not a code defect.
 */
export async function roomsSharingAHost(): Promise<SharedHostReport[]> {
  const [rows] = await (await db()).query(
    `SELECT COALESCE(NULLIF(LOWER(metadata->>'${ROOM_HOST_METADATA_KEY}'), ''), :fallback) AS host_email,
            COUNT(*)::int AS room_count,
            ARRAY_AGG(name ORDER BY name) AS rooms
       FROM community_rooms
      WHERE meeting_link IS NOT NULL
      GROUP BY 1
     HAVING COUNT(*) > 1
      ORDER BY 2 DESC`,
    { replacements: { fallback: normalize(env.zoomHostEmail) } },
  ) as [SharedHostReport[], unknown];
  return rows || [];
}
