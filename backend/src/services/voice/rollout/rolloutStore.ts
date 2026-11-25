/**
 * Rollout state (VS4.5): read the facts an allocation needs, and roll a route back.
 *
 * No cache anywhere: every allocation reads the route row, so a rollback reaches the next call at once and
 * a process restart is never needed. Any read failure allocates legacy (today's behavior) unless the call
 * was already dispatched, which is checked first and fails closed.
 *
 * The canary audience lives in voice_routes.fallback.audience (additive; no schema change).
 */
import { QueryTypes, type Sequelize } from 'sequelize';
import { tapVoiceLog } from '../ops/opsMetrics';
import { allocate, type Allocation, type RouteFacts, type VersionFacts } from './allocation';

export interface RouteRequest { tenantId: string; pathKey: string; brandSlug: string; recipientRef: string; idempotencyKey: string; testMode: boolean }

interface Row { id: string; brand_slug: string; profile_id: string | null; mode: string; canary_percent: number; audience: unknown; v_id: string | null; v_profile: string | null; v_status: string | null; v_engine: string | null; v_brand: string | null }

const log = (l: Record<string, unknown>) => (l.level === 'info' ? console.log : console.warn)(JSON.stringify(tapVoiceLog({ service: 'voice-gateway', ...l })));

export async function allocateCall(s: Sequelize, r: RouteRequest, directReady: boolean): Promise<Allocation> {
  let prior: { engine: string; state: string } | null;
  try {
    const rows = await s.query<{ engine: string; state: string }>('SELECT engine, state FROM voice_calls WHERE tenant_id = :t AND idempotency_key = :k',
      { replacements: { t: r.tenantId, k: r.idempotencyKey }, type: QueryTypes.SELECT });
    prior = rows[0] ?? null;
  } catch (e) {
    log({ level: 'error', event: 'voice_allocation_failed', outcome: 'failure', error_class: (e as Error).name || 'DatabaseError', step: 'prior' });
    return { provider: 'none', reason: 'prior_unreadable', bucket: null }; // it might already have been dialed
  }
  let route: RouteFacts | null = null;
  let version: VersionFacts | null = null;
  try {
    const [x] = await s.query<Row>(
      `SELECT r.id, r.brand_slug, r.profile_id, r.mode, r.canary_percent, r.fallback->'audience' AS audience,
              v.id AS v_id, v.profile_id AS v_profile, v.status AS v_status, v.engine AS v_engine, p.brand_slug AS v_brand
         FROM voice_routes r LEFT JOIN voice_agent_versions v ON v.id = r.version_id AND v.tenant_id = r.tenant_id LEFT JOIN voice_agent_profiles p ON p.id = v.profile_id
        WHERE r.tenant_id = :t AND r.path_key = :p`, { replacements: { t: r.tenantId, p: r.pathKey }, type: QueryTypes.SELECT });
    if (x) {
      const audience = Array.isArray(x.audience) ? x.audience.filter((a): a is string => typeof a === 'string') : [];
      route = { id: x.id, brandSlug: x.brand_slug, profileId: x.profile_id, mode: x.mode, canaryPercent: x.canary_percent, audience };
      if (x.v_id) version = { id: x.v_id, profileId: x.v_profile as string, brandSlug: x.v_brand ?? '', status: x.v_status as string, engine: x.v_engine as string };
    }
  } catch (e) {
    log({ level: 'error', event: 'voice_allocation_failed', outcome: 'failure', error_class: (e as Error).name || 'DatabaseError', step: 'route' });
    return { provider: 'synthflow_legacy', reason: 'route_unreadable', bucket: null };
  }
  const a = allocate({ route, version, recipientRef: r.recipientRef, brandSlug: r.brandSlug, testMode: r.testMode, directReady, prior });
  log({ level: 'info', event: 'voice_allocated', outcome: 'success', path: r.pathKey, provider: a.provider, reason: a.reason, bucket: a.bucket });
  return a;
}

export interface RollbackResult { changed: boolean; from: { mode: string; canaryPercent: number } | null; activeCalls: number }

/**
 * Send every NEW call on a path back to legacy. Active calls are left to finish where they are. Idempotent:
 * a second rollback changes nothing. dry: report only.
 */
export async function rollbackRoute(s: Sequelize, tenantId: string, pathKey: string, actor: string, dry: boolean): Promise<RollbackResult> {
  return s.transaction(async (transaction) => {
    const [x] = await s.query<{ id: string; mode: string; canary_percent: number }>('SELECT id, mode, canary_percent FROM voice_routes WHERE tenant_id = :t AND path_key = :p FOR UPDATE',
      { replacements: { t: tenantId, p: pathKey }, type: QueryTypes.SELECT, transaction });
    if (!x) return { changed: false, from: null, activeCalls: 0 };
    const [c] = await s.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM voice_calls WHERE route_id = :id AND state IN ('dispatching','queued','ringing','answered','session_active')",
      { replacements: { id: x.id }, type: QueryTypes.SELECT, transaction });
    const from = { mode: x.mode, canaryPercent: x.canary_percent };
    if (x.mode === 'legacy' && x.canary_percent === 0) return { changed: false, from, activeCalls: c.n };
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
