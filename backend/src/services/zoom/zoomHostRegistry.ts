/**
 * Which Zoom hosts the platform may create meetings as, and whether each one
 * actually works.
 *
 * WHY A HOST MUST BE PROVED BEFORE IT IS USED. An unverified host is a row someone
 * typed. If the allocator trusts it, the failure surfaces at the worst possible
 * moment — a student presses "reserve", the slot is held, and the Zoom call 404s on
 * a user that does not exist or is not ours. So `verified_at` gates allocation, and
 * only a real API round-trip sets it.
 *
 * THIS MODULE HOLDS NO SECRETS. `credential_ref` names a credential kept elsewhere,
 * for the case where a host lives in a different Zoom account. Nothing here reads or
 * stores a client secret.
 */

/** Lazy so importing this module never constructs the ORM. */
async function db() {
  const { sequelize } = await import('../../config/database');
  return sequelize;
}

export interface ZoomHostRow {
  id: string;
  host_email: string;
  label: string | null;
  purpose: string;
  enabled: boolean;
  priority: number;
  credential_ref: string | null;
  verified_at: Date | null;
  last_error: string | null;
}

/**
 * The purposes a host may serve, and why the distinction is load-bearing.
 *
 * TWO ALLOCATORS DRAW FROM THIS POOL AND NEITHER SEES THE OTHER'S CLAIM.
 * `roomHostAllocator` takes a host and keeps it, because a room's join link is
 * permanent; it counts rows in `community_rooms`. `presentationCapacityService` takes
 * a host for one rehearsal window; it counts rows in `presentation_slot_reservations`.
 * Neither query can see the other's table.
 *
 * A host registered `any` matches BOTH. And both allocators walk the pool in priority
 * order and take the first host that fits, so they do not merely collide now and
 * then — they systematically prefer the SAME host. Splitting a populated pool by
 * purpose is what stops a student's rehearsal being handed the host that is already
 * carrying a live room: the original "two meetings tied together" fault wearing a
 * different hat.
 *
 * `any` stays the default because it is the honest answer for a single-host install.
 * With one host everything shares it regardless, and defaulting to a narrower purpose
 * would make an empty pool look like a partitioned one.
 *
 * THIS LIST IS THE ONLY VOCABULARY. There used to be a second one in
 * `ensureZoomHostSchema.ts` reading `['any', 'classes', 'practice', 'rooms']`, and the
 * disagreement was not cosmetic: the allocator queries `room`, singular, so a host
 * registered as `rooms` matched neither allocator and was simply dead capacity that
 * `list` showed as verified. A purpose name is a join key between a registry row and
 * an allocator's query, so it gets one definition.
 */
export const HOST_PURPOSES = ['any', 'room', 'practice'] as const;

export type HostPurpose = (typeof HOST_PURPOSES)[number];

/**
 * The purpose the rehearsal allocator asks for.
 *
 * Named here rather than written as a literal at each call site for the reason above:
 * the string is a join key, and `presentationCapacityService` asking for one spelling
 * while a row holds another produces an empty pool and a queue of one, which is the
 * behaviour this feature was built to remove. Its room-side counterpart is
 * `ROOM_HOST_PURPOSE` in `roomHostAllocator`, and a test pins both into this list.
 */
export const PRACTICE_HOST_PURPOSE: HostPurpose = 'practice';

export const isHostPurpose = (value: unknown): value is HostPurpose =>
  (HOST_PURPOSES as readonly string[]).includes(String(value));

export interface RegisterHostInput {
  hostEmail: string;
  label?: string | null;
  purpose?: string;
  priority?: number;
  credentialRef?: string | null;
  enabled?: boolean;
}

/**
 * Adds or updates a host.
 *
 * A NEW row takes the documented defaults (`any`, priority 100, enabled). An EXISTING
 * row keeps every field the caller did not mention.
 *
 * WHY OMISSION PRESERVES RATHER THAN RESETS. This used to assign every column from the
 * incoming row, so the natural way to change one thing — `register a@b.com
 * --purpose=room` — silently cleared that host's label, priority and credential_ref.
 * Re-running the registration of a host that is already registered is the single most
 * likely thing an operator does with this tool, and it has to be safe: same input,
 * same end state, nothing else moved.
 *
 * `verified_at` is not in either list, so verification SURVIVES a re-registration. A
 * new row has none and must be proved; changing a label or a purpose does not make the
 * Zoom user stop existing, and forcing a re-verify there would just train people to
 * run `verify` without reading it.
 */
export async function registerHost(input: RegisterHostInput): Promise<void> {
  const email = String(input.hostEmail || '').trim().toLowerCase();
  if (!email) throw Object.assign(new Error('hostEmail is required'), { error_class: 'ValidationError' });
  await (await db()).query(
    // Each value is read from the named parameter rather than EXCLUDED, because
    // EXCLUDED carries the INSERT's defaults — EXCLUDED.purpose is already 'any' when
    // the caller omitted it, which would defeat the preservation below.
    `INSERT INTO zoom_hosts (host_email, label, purpose, priority, credential_ref, enabled)
       VALUES (:email,
               :label::varchar,
               COALESCE(:purpose::varchar, 'any'),
               COALESCE(:priority::integer, 100),
               :cred::varchar,
               COALESCE(:enabled::boolean, TRUE))
     ON CONFLICT (LOWER(host_email)) DO UPDATE
       SET label = COALESCE(:label::varchar, zoom_hosts.label),
           purpose = COALESCE(:purpose::varchar, zoom_hosts.purpose),
           priority = COALESCE(:priority::integer, zoom_hosts.priority),
           credential_ref = COALESCE(:cred::varchar, zoom_hosts.credential_ref),
           enabled = COALESCE(:enabled::boolean, zoom_hosts.enabled),
           updated_at = NOW()`,
    {
      replacements: {
        email,
        label: input.label ?? null,
        purpose: input.purpose ?? null,
        priority: input.priority ?? null,
        cred: input.credentialRef ?? null,
        enabled: input.enabled ?? null,
      },
    },
  );
}

/**
 * Turns a host off or on, touching nothing else.
 *
 * NOT `registerHost({ enabled: false })`, which is what this used to be. That path
 * goes through `ON CONFLICT DO UPDATE` and assigns every column from the incoming
 * row, so disabling a host reset its label, priority, credential_ref and — now that
 * the value decides which allocator may take it — its PURPOSE, back to `any`. A host
 * parked for an afternoon came back shared between rooms and rehearsals, which is the
 * exact collision the purpose split exists to prevent, arriving silently.
 */
export async function setHostEnabled(hostEmail: string, enabled: boolean): Promise<void> {
  const email = String(hostEmail || '').trim();
  if (!email) throw Object.assign(new Error('hostEmail is required'), { error_class: 'ValidationError' });
  await (await db()).query(
    `UPDATE zoom_hosts SET enabled = :enabled, updated_at = NOW()
      WHERE LOWER(host_email) = LOWER(:email)`,
    { replacements: { email, enabled } },
  );
}

/** Every registered host, for an operator to look at. Includes unusable ones. */
export async function listHosts(): Promise<ZoomHostRow[]> {
  const [rows] = await (await db()).query(
    `SELECT id, host_email, label, purpose, enabled, priority, credential_ref, verified_at, last_error
       FROM zoom_hosts ORDER BY priority ASC, host_email ASC`,
  ) as [ZoomHostRow[], unknown];
  return rows || [];
}

/**
 * The hosts the allocator may actually use, best first.
 *
 * Returns `[]` when nothing is registered or verified — and the caller must treat
 * that as "use the configured default", not as "no capacity". An empty registry is
 * the normal state before anyone sets this up, and it must behave exactly as the
 * platform did before this feature existed.
 */
export async function allocatableHostEmails(purpose = 'any'): Promise<string[]> {
  const [rows] = await (await db()).query(
    `SELECT host_email
       FROM zoom_hosts
      WHERE enabled
        AND verified_at IS NOT NULL
        AND (purpose = 'any' OR purpose = :purpose)
      ORDER BY priority ASC, host_email ASC`,
    { replacements: { purpose } },
  ) as [Array<{ host_email: string }>, unknown];
  return (rows || []).map((r) => r.host_email);
}

export interface CrossPurposeHost {
  host_email: string;
  room_count: number;
}

/**
 * Hosts a rehearsal can take out from under a live room.
 *
 * The hazard is narrow and entirely decidable from the registry plus a room count: a
 * host is exposed when it is allocatable, its purpose is `any` (so BOTH allocators
 * match it — see `HOST_PURPOSES`), and it already carries at least one room's
 * permanent link. The room keeps the link forever, so the rehearsal is the party that
 * discovers the collision, mid-call.
 *
 * PURE ON PURPOSE. The two inputs come from different tables and the judgement between
 * them is the part worth testing; folding it into a join would make it unreachable
 * without a database and untestable at the boundary that matters.
 *
 * An unverified or disabled host is NOT exposed, because no allocator can pick it.
 * Reporting it would train an operator to ignore this list.
 */
export function crossPurposeHosts(
  hosts: ReadonlyArray<Pick<ZoomHostRow, 'host_email' | 'purpose' | 'enabled' | 'verified_at'>>,
  roomCounts: ReadonlyMap<string, number>,
): CrossPurposeHost[] {
  const out: CrossPurposeHost[] = [];
  for (const host of hosts) {
    if (!host.enabled || !host.verified_at) continue;
    if (host.purpose !== 'any') continue;
    const email = String(host.host_email ?? '').trim();
    const count = roomCounts.get(email.toLowerCase()) ?? 0;
    if (count > 0) out.push({ host_email: email, room_count: count });
  }
  return out.sort((a, b) => b.room_count - a.room_count || a.host_email.localeCompare(b.host_email));
}

async function setVerified(email: string, ok: boolean, error?: string): Promise<void> {
  await (await db()).query(
    ok
      ? `UPDATE zoom_hosts SET verified_at = NOW(), last_error = NULL, updated_at = NOW()
          WHERE LOWER(host_email) = LOWER(:email)`
      : `UPDATE zoom_hosts SET verified_at = NULL, last_error = :err, updated_at = NOW()
          WHERE LOWER(host_email) = LOWER(:email)`,
    { replacements: { email, err: String(error || '').slice(0, 500) } },
  );
}

export type VerifyFailureReason = 'missing_scope' | 'not_found' | 'error';

export type VerifyResult =
  | { ok: true; hostEmail: string }
  | { ok: false; hostEmail: string; reason: VerifyFailureReason; detail: string };

/**
 * Proves a host by asking Zoom about it, and records the answer.
 *
 * A READ, never a create. Verifying by making a meeting would leave real meetings
 * scattered across every host each time someone checked, on accounts that also run
 * live classes.
 *
 * `missing_scope` is reported separately from `not_found` because they need opposite
 * responses from a human: one is a Zoom app setting, the other means the host is not
 * in this account and needs its own credential. Collapsing them into "failed" sends
 * someone looking in the wrong place.
 */
export async function verifyHost(hostEmail: string): Promise<VerifyResult> {
  const email = String(hostEmail || '').trim();
  const zoomService = await import('../zoomService');
  try {
    await zoomService.listUpcomingMeetingsWithAgenda(email);
    await setVerified(email, true);
    return { ok: true, hostEmail: email };
  } catch (err: any) {
    const msg = String(err?.message || err);
    // Zoom answers 400/4711 for a scope the app does not carry. That says nothing
    // about whether the host exists, so it must not be recorded as a bad host.
    const reason: VerifyFailureReason =
      /4711|does not contain scopes/.test(msg) ? 'missing_scope'
        : /404|1001|does not exist|not found/i.test(msg) ? 'not_found'
          : 'error';
    await setVerified(email, false, `${reason}: ${msg}`.slice(0, 500));
    return { ok: false, hostEmail: email, reason, detail: msg.slice(0, 300) };
  }
}

/** Verifies every registered host. Returns one result per host, in registry order. */
export async function verifyAllHosts(): Promise<VerifyResult[]> {
  const hosts = await listHosts();
  const out: VerifyResult[] = [];
  for (const h of hosts) out.push(await verifyHost(h.host_email));
  return out;
}
