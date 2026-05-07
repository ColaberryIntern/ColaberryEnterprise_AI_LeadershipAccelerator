/**
 * isolationRegistry — Phase 14 quarantine of unstable cluster signatures.
 *
 * Storage strategy (per stress-test):
 *   - Source of truth: GovernanceAuditEntry rows of kind
 *     'autonomy_isolation_activated' with payload.expires_at > now AND no
 *     subsequent 'autonomy_isolation_lifted' (encoded as audit kind
 *     'autonomy_self_heal_triggered' with payload.action='lift'; we keep
 *     the audit kind enum minimal and reuse self_heal for the lift signal).
 *   - In-memory cache: hot-path lookup keyed by project_id → Set<signature>.
 *
 * NO new table. The Phase 13 audit-row pattern carries the data and survives
 * server restart (cache is rebuilt lazily from the most recent audit rows).
 *
 * Phase 14 §A.5 (the only standalone helper after stress-test trim).
 */

interface IsolationCacheEntry {
  expires_at: number;
  reason: string;
  recorded_at: number;
}

const cache = new Map<string, Map<string, IsolationCacheEntry>>();
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 60 minutes
const CACHE_HYDRATE_LOOKBACK_MS = 24 * 60 * 60 * 1000;

function projectMap(project_id: string): Map<string, IsolationCacheEntry> {
  let m = cache.get(project_id);
  if (!m) {
    m = new Map();
    cache.set(project_id, m);
  }
  return m;
}

export interface IsolationRecord {
  signature: string;
  expires_at: string;
  reason: string;
  recorded_at: string;
}

export interface RecordIsolationInput {
  project_id: string;
  signature: string;
  reason: string;
  ttl_ms?: number;
  operator_id?: string;
}

export async function recordIsolation(opts: RecordIsolationInput): Promise<IsolationRecord> {
  const ttl = opts.ttl_ms ?? DEFAULT_TTL_MS;
  const now = Date.now();
  const expires_at = now + ttl;
  // Hot-path cache write
  projectMap(opts.project_id).set(opts.signature, { expires_at, reason: opts.reason, recorded_at: now });
  // Durable audit row
  try {
    const { default: GovernanceAuditEntry } = await import('../../../models/GovernanceAuditEntry');
    await GovernanceAuditEntry.create({
      project_id: opts.project_id,
      kind: 'autonomy_isolation_activated',
      subject_id: null,
      payload: {
        cluster_signature: opts.signature,
        reason: opts.reason,
        expires_at: new Date(expires_at).toISOString(),
        ttl_ms: ttl,
      },
      operator_id: opts.operator_id ?? null,
      recorded_at: new Date(now),
    } as any);
  } catch (err: any) {
    console.warn('[isolationRegistry] audit row write failed:', err?.message);
  }
  return {
    signature: opts.signature,
    expires_at: new Date(expires_at).toISOString(),
    reason: opts.reason,
    recorded_at: new Date(now).toISOString(),
  };
}

export async function liftIsolation(project_id: string, signature: string, operator_id?: string): Promise<void> {
  projectMap(project_id).delete(signature);
  try {
    const { default: GovernanceAuditEntry } = await import('../../../models/GovernanceAuditEntry');
    await GovernanceAuditEntry.create({
      project_id,
      // We reuse self_heal_triggered kind with a 'lift' action so the
      // audit kind enum stays minimal. The payload disambiguates.
      kind: 'autonomy_self_heal_triggered',
      subject_id: null,
      payload: { action: 'isolation_lifted', cluster_signature: signature },
      operator_id: operator_id ?? null,
      recorded_at: new Date(),
    } as any);
  } catch (err: any) {
    console.warn('[isolationRegistry] lift audit failed:', err?.message);
  }
}

/**
 * Read the active isolations for a project. Hot-path uses in-memory
 * cache; on cache miss for a fresh project, hydrate from recent audit
 * rows (the last 24h).
 */
export async function getActiveIsolations(project_id: string): Promise<IsolationRecord[]> {
  const now = Date.now();
  const map = projectMap(project_id);

  // Lazy hydrate: if cache is empty for this project, try DB once.
  if (map.size === 0) {
    try {
      const { Op } = await import('sequelize');
      const { default: GovernanceAuditEntry } = await import('../../../models/GovernanceAuditEntry');
      const since = new Date(now - CACHE_HYDRATE_LOOKBACK_MS);
      const rows: any[] = await GovernanceAuditEntry.findAll({
        where: { project_id, kind: 'autonomy_isolation_activated', recorded_at: { [Op.gte]: since } },
        order: [['recorded_at', 'DESC']],
        limit: 200,
      });
      for (const r of rows) {
        const sig = (r.payload || {}).cluster_signature;
        const exp = (r.payload || {}).expires_at;
        if (!sig || !exp) continue;
        const expMs = new Date(exp).getTime();
        if (expMs > now) {
          map.set(sig, {
            expires_at: expMs,
            reason: (r.payload || {}).reason || 'unknown',
            recorded_at: new Date(r.recorded_at).getTime(),
          });
        }
      }
    } catch (err: any) {
      console.warn('[isolationRegistry] hydrate failed:', err?.message);
    }
  }

  // Trim expired entries inline
  const out: IsolationRecord[] = [];
  for (const [sig, entry] of map.entries()) {
    if (entry.expires_at <= now) { map.delete(sig); continue; }
    out.push({
      signature: sig,
      expires_at: new Date(entry.expires_at).toISOString(),
      reason: entry.reason,
      recorded_at: new Date(entry.recorded_at).toISOString(),
    });
  }
  return out.sort((a, b) => a.expires_at.localeCompare(b.expires_at));
}

/**
 * Sync, cache-only count of active isolations for a project. Does NOT
 * hydrate from DB on cache miss. Safe to call from the synchronous
 * `buildAuthoritativeStateFromInputs` path.
 */
export function countActiveIsolationsSync(project_id: string): number {
  const map = cache.get(project_id);
  if (!map) return 0;
  const now = Date.now();
  let count = 0;
  for (const [sig, entry] of map.entries()) {
    if (entry.expires_at <= now) { map.delete(sig); continue; }
    count++;
  }
  return count;
}

export function isIsolated(project_id: string, signature: string, now = Date.now()): boolean {
  const entry = projectMap(project_id).get(signature);
  if (!entry) return false;
  if (entry.expires_at <= now) {
    projectMap(project_id).delete(signature);
    return false;
  }
  return true;
}

/** Test-only reset. */
export function _resetIsolationRegistry(): void {
  cache.clear();
}
