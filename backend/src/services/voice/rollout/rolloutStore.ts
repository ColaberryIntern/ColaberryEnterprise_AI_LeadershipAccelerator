/**
 * Rollout state (VS4.5): allocate and CLAIM one provider for a logical call, and roll a route back.
 *
 * The claim is one row per (tenant, idempotency key) in voice_allocations, written in the same transaction
 * that reads the route under a shared lock. rollbackRoute takes that row exclusively, so an allocation is
 * wholly before or wholly after a rollback. A direct claim is confirmed again, under the same lock, right
 * before the carrier is asked (confirmDirect): a claim the route no longer permits is not dialed.
 *
 * Claim states: claimed -> dispatching (dialing). abandoned = refused before anything was reserved, so the
 * key may be claimed afresh. closed = refused after its reservation existed: that key is finished, and
 * nothing was dialed. A claim left in claimed or dispatching is never given out again: it may have dialed.
 *
 * No cache: every allocation reads the route row, so a rollback reaches the next call at once. If the
 * claim cannot be written nothing may be dialed by anyone (provider none).
 *
 * The canary audience lives in voice_routes.fallback.audience (additive; no schema change).
 */
import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import { tapVoiceLog } from '../ops/opsMetrics';
import { allocate, type Allocation, type RouteFacts, type VersionFacts } from './allocation';

export interface RouteRequest { tenantId: string; pathKey: string; brandSlug: string; recipientRef: string; idempotencyKey: string; testMode: boolean }

interface Row { id: string; brand_slug: string; profile_id: string | null; mode: string; canary_percent: number; audience: unknown; version_id: string | null }

const log = (l: Record<string, unknown>) => (l.level === 'info' ? console.log : console.warn)(JSON.stringify(tapVoiceLog({ service: 'voice-gateway', ...l })));

async function readRoute(s: Sequelize, tenantId: string, pathKey: string, transaction: Transaction): Promise<{ route: RouteFacts | null; version: VersionFacts | null }> {
  const [x] = await s.query<Row>("SELECT id, brand_slug, profile_id, mode, canary_percent, fallback->'audience' AS audience, version_id FROM voice_routes WHERE tenant_id = :t AND path_key = :p FOR SHARE",
    { replacements: { t: tenantId, p: pathKey }, type: QueryTypes.SELECT, transaction });
  if (!x) return { route: null, version: null };
  const audience = Array.isArray(x.audience) ? x.audience.filter((a): a is string => typeof a === 'string') : [];
  const route: RouteFacts = { id: x.id, brandSlug: x.brand_slug, profileId: x.profile_id, mode: x.mode, canaryPercent: x.canary_percent, audience };
  if (!x.version_id) return { route, version: null };
  const [v] = await s.query<{ id: string; profile_id: string; status: string; engine: string; brand: string | null }>(
    'SELECT v.id, v.profile_id, v.status, v.engine, p.brand_slug AS brand FROM voice_agent_versions v LEFT JOIN voice_agent_profiles p ON p.id = v.profile_id WHERE v.id = :v AND v.tenant_id = :t',
    { replacements: { v: x.version_id, t: tenantId }, type: QueryTypes.SELECT, transaction });
  return { route, version: v ? { id: v.id, profileId: v.profile_id, brandSlug: v.brand ?? '', status: v.status, engine: v.engine } : null };
}

export async function allocateCall(s: Sequelize, r: RouteRequest, directReady: boolean): Promise<Allocation> {
  try {
    const a = await s.transaction(async (transaction): Promise<Allocation> => {
      const rows = await s.query<{ engine: string; state: string }>('SELECT engine, state FROM voice_calls WHERE tenant_id = :t AND idempotency_key = :k',
        { replacements: { t: r.tenantId, k: r.idempotencyKey }, type: QueryTypes.SELECT, transaction });
      const { route, version } = await readRoute(s, r.tenantId, r.pathKey, transaction);
      const decided = allocate({ route, version, recipientRef: r.recipientRef, brandSlug: r.brandSlug, testMode: r.testMode, directReady, prior: rows[0] ?? null });
      if (decided.provider === 'none') return decided;
      const direct = decided.provider === 'direct' ? decided : null;
      const claimed = await s.query<{ id: string }>(
        `INSERT INTO voice_allocations (tenant_id, idempotency_key, path_key, recipient_ref, provider, engine, route_id, version_id, reason)
         VALUES (:t, :k, :p, :ref, :provider, :engine, :route, :version, :reason)
         ON CONFLICT (tenant_id, idempotency_key) DO UPDATE SET path_key = EXCLUDED.path_key, recipient_ref = EXCLUDED.recipient_ref, provider = EXCLUDED.provider, engine = EXCLUDED.engine,
           route_id = EXCLUDED.route_id, version_id = EXCLUDED.version_id, reason = EXCLUDED.reason, status = 'claimed', updated_at = NOW()
         WHERE voice_allocations.status = 'abandoned' RETURNING id`,
        { replacements: { t: r.tenantId, k: r.idempotencyKey, p: r.pathKey, ref: r.recipientRef, provider: decided.provider, engine: direct?.engine ?? null, route: route?.id ?? null, version: direct?.versionId ?? null, reason: decided.reason }, type: QueryTypes.SELECT, transaction });
      if (!claimed[0]) return { provider: 'none', reason: 'already_claimed', bucket: decided.bucket };
      return { ...decided, claimId: claimed[0].id };
    });
    log({ level: 'info', event: 'voice_allocated', outcome: 'success', path: r.pathKey, provider: a.provider, reason: a.reason, bucket: a.bucket });
    return a;
  } catch (e) {
    log({ level: 'error', event: 'voice_allocation_failed', outcome: 'failure', error_class: (e as Error).name || 'DatabaseError' });
    return { provider: 'none', reason: 'claim_unavailable', bucket: null }; // it might already be someone's
  }
}

/** Right before the carrier is asked: does the route still permit this exact direct claim? Moves it to dispatching, once. */
export async function confirmDirect(s: Sequelize, tenantId: string, claimId: string): Promise<boolean> {
  return s.transaction(async (transaction) => {
    const [c] = await s.query<{ path_key: string; route_id: string; version_id: string }>("SELECT path_key, route_id, version_id FROM voice_allocations WHERE id = :id AND tenant_id = :t AND provider = 'direct' AND status = 'claimed' FOR UPDATE",
      { replacements: { id: claimId, t: tenantId }, type: QueryTypes.SELECT, transaction });
    if (!c) return false;
    const { route, version } = await readRoute(s, tenantId, c.path_key, transaction);
    if (!route || route.id !== c.route_id || !['test', 'canary', 'live'].includes(route.mode) || version?.id !== c.version_id || version.status !== 'published') return false;
    await s.query("UPDATE voice_allocations SET status = 'dispatching', updated_at = NOW() WHERE id = :id", { replacements: { id: claimId }, transaction });
    return true;
  });
}

/** Nothing was dialed for this claim. reserved = its reservation already exists, so the key is finished. */
export async function releaseClaim(s: Sequelize, tenantId: string, claimId: string, reserved: boolean): Promise<void> {
  await s.query("UPDATE voice_allocations SET status = :st, updated_at = NOW() WHERE id = :id AND tenant_id = :t AND status IN (:from)",
    // A refused second attempt must never reopen a claim the first one is dialing with.
    { replacements: { id: claimId, t: tenantId, st: reserved ? 'closed' : 'abandoned', from: reserved ? ['claimed', 'dispatching'] : ['claimed'] } });
}

export interface RollbackResult { changed: boolean; reason?: 'no_route' | 'already_legacy' | 'disabled_left_alone'; from: { mode: string; canaryPercent: number } | null; activeCalls: number }

/**
 * Send every NEW call on a path back to legacy. Active calls are left to finish where they are. Idempotent:
 * a second rollback changes nothing. dry: report only.
 */
export async function rollbackRoute(s: Sequelize, tenantId: string, pathKey: string, actor: string, dry: boolean): Promise<RollbackResult> {
  return s.transaction(async (transaction) => {
    const [x] = await s.query<{ id: string; mode: string; canary_percent: number }>('SELECT id, mode, canary_percent FROM voice_routes WHERE tenant_id = :t AND path_key = :p FOR UPDATE',
      { replacements: { t: tenantId, p: pathKey }, type: QueryTypes.SELECT, transaction });
    if (!x) return { changed: false, reason: 'no_route', from: null, activeCalls: 0 };
    const [c] = await s.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM voice_calls WHERE route_id = :id AND state IN ('dispatching','queued','ringing','answered','session_active')",
      { replacements: { id: x.id }, type: QueryTypes.SELECT, transaction });
    const from = { mode: x.mode, canaryPercent: x.canary_percent };
    if (x.mode === 'disabled') return { changed: false, reason: 'disabled_left_alone', from, activeCalls: c.n }; // legacy would switch dialing back ON
    if (x.mode === 'legacy' && x.canary_percent === 0) return { changed: false, reason: 'already_legacy', from, activeCalls: c.n };
    if (!dry) {
      await s.query("UPDATE voice_routes SET mode = 'legacy', canary_percent = 0, engine = 'synthflow_legacy', approved_by = :actor, approved_at = NOW(), updated_at = NOW() WHERE id = :id",
        { replacements: { id: x.id, actor }, transaction });
      await s.query(
        `INSERT INTO audit_logs (id, admin_user_id, action, entity_type, entity_id, old_values, new_values, created_at)
         VALUES (gen_random_uuid(), NULL, 'voice_route_rollback', 'voice_route', :id, CAST(:old AS jsonb), CAST(:new AS jsonb), NOW())`,
        { replacements: { id: x.id, old: JSON.stringify(from), new: JSON.stringify({ mode: 'legacy', actor }) }, transaction });
    }
    return { changed: !dry, from, activeCalls: c.n };
  });
}
