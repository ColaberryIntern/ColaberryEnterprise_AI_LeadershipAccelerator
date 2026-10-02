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

export interface RegisterHostInput {
  hostEmail: string;
  label?: string | null;
  purpose?: string;
  priority?: number;
  credentialRef?: string | null;
  enabled?: boolean;
}

/**
 * Adds or updates a host. Registering does NOT make it usable — `verified_at` is
 * deliberately left alone here, so a re-registered host must be proved again.
 */
export async function registerHost(input: RegisterHostInput): Promise<void> {
  const email = String(input.hostEmail || '').trim().toLowerCase();
  if (!email) throw Object.assign(new Error('hostEmail is required'), { error_class: 'ValidationError' });
  await (await db()).query(
    `INSERT INTO zoom_hosts (host_email, label, purpose, priority, credential_ref, enabled)
       VALUES (:email, :label, :purpose, :priority, :cred, :enabled)
     ON CONFLICT (LOWER(host_email)) DO UPDATE
       SET label = EXCLUDED.label,
           purpose = EXCLUDED.purpose,
           priority = EXCLUDED.priority,
           credential_ref = EXCLUDED.credential_ref,
           enabled = EXCLUDED.enabled,
           updated_at = NOW()`,
    {
      replacements: {
        email,
        label: input.label ?? null,
        purpose: input.purpose ?? 'any',
        priority: input.priority ?? 100,
        cred: input.credentialRef ?? null,
        enabled: input.enabled !== false,
      },
    },
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
