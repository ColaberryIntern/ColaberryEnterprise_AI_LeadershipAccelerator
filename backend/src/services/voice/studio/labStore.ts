/**
 * Voice Lab and Numbers & Routing persistence (VS3.4). Raw SQL with bound replacements and rows
 * typed at the call site. No phone number is ever selected: voice_numbers.e164_restricted is read
 * only by the carrier at dispatch time.
 *
 * A/B trials live in voice_evaluation_runs (scenario_set 'voice_ab', verdict pending -> scored):
 * scoring is one conditional UPDATE, so a trial is scored once even if two people click together.
 * A route write is one INSERT or UPDATE statement and records who approved it.
 */
import { QueryTypes } from 'sequelize';
import type { AbTrial, TrialStore } from './voiceLab';
import type { RouteChange } from './routeChange';

async function db() { return (await import('../../../config/database')).sequelize; }
async function tenant() { return (await import('../gateway/legacyFacade')).LEGACY_TENANT_ID; }

interface TrialRow { id: string; verdict: string; scores: { x: string; y: string; text: string; preferred?: 'X' | 'Y' | 'tie'; scored_by?: string } }
const toTrial = (r: TrialRow): AbTrial => ({ id: r.id, x: r.scores.x, y: r.scores.y, text: r.scores.text, preferred: r.verdict === 'scored' ? (r.scores.preferred ?? null) : null, scoredBy: r.scores.scored_by ?? null });

export const sqlTrialStore: TrialStore = {
  async create(t, createdBy) {
    const s = await db();
    const rows = await s.query<{ id: string }>(
      `INSERT INTO voice_evaluation_runs (tenant_id, engine, scenario_set, environment, scores, verdict)
       VALUES (:tenant, 'openai_realtime', 'voice_ab', 'lab', CAST(:scores AS jsonb), 'pending') RETURNING id`,
      { replacements: { tenant: await tenant(), scores: JSON.stringify({ x: t.x, y: t.y, text: t.text, created_by: createdBy }) }, type: QueryTypes.SELECT });
    return rows[0].id;
  },
  async get(id) {
    const s = await db();
    const rows = await s.query<TrialRow>("SELECT id, verdict, scores FROM voice_evaluation_runs WHERE id = :id AND scenario_set = 'voice_ab'", { replacements: { id }, type: QueryTypes.SELECT });
    return rows[0] ? toTrial(rows[0]) : null;
  },
  async score(id, preferred, by, note) {
    const s = await db();
    const rows = await s.query<TrialRow>(
      `UPDATE voice_evaluation_runs
          SET verdict = 'scored', scores = scores || jsonb_build_object('preferred', CAST(:preferred AS text), 'scored_by', CAST(:by AS text), 'note', CAST(:note AS text))
        WHERE id = :id AND scenario_set = 'voice_ab' AND verdict = 'pending'
        RETURNING id, verdict, scores`,
      { replacements: { id, preferred, by, note: note ?? '' }, type: QueryTypes.SELECT });
    return rows[0] ? toTrial(rows[0]) : null;
  },
};

export interface NumberRow { id: string; provider: string; provider_number_id: string; number_ref: string; ownership: string; status: string; capabilities: Record<string, unknown>; brand_slug: string | null; routing_policy: Record<string, unknown>; verified_caller_id: boolean }

export async function listNumbers(): Promise<NumberRow[]> {
  const s = await db();
  return s.query<NumberRow>(
    `SELECT id, provider, provider_number_id, number_ref, ownership, status, capabilities, brand_slug, routing_policy, verified_caller_id
       FROM voice_numbers ORDER BY status, number_ref LIMIT 200`, { type: QueryTypes.SELECT });
}

export interface RouteRow { id: string; path_key: string; call_type: string; brand_slug: string; engine: string; mode: string; canary_percent: number; profile_id: string | null; version_id: string | null; fallback: Record<string, unknown>; approved_by: string | null; approved_at: string | null; calls_7d: number }

export async function listRoutes(): Promise<RouteRow[]> {
  const s = await db();
  return s.query<RouteRow>(
    `SELECT r.id, r.path_key, r.call_type, r.brand_slug, r.engine, r.mode, r.canary_percent, r.profile_id, r.version_id, r.fallback, r.approved_by, r.approved_at,
            (SELECT COUNT(*)::int FROM voice_calls c WHERE c.route_id = r.id AND c.created_at >= NOW() - INTERVAL '7 days') AS calls_7d
       FROM voice_routes r ORDER BY r.path_key LIMIT 200`, { type: QueryTypes.SELECT });
}

export async function getRoute(id: string): Promise<RouteRow | null> {
  return (await listRoutes()).find((r) => r.id === id) ?? null;
}

export async function versionFacts(versionId: string | null): Promise<{ versionPublished: boolean; profileId: string | null; engine: string | null; versionBrand: string | null; versionEngine: string | null }> {
  if (!versionId) return { versionPublished: false, profileId: null, engine: null, versionBrand: null, versionEngine: null };
  const s = await db();
  const rows = await s.query<{ status: string; profile_id: string; engine: string; brand: string | null }>('SELECT v.status, v.profile_id, v.engine, p.brand_slug AS brand FROM voice_agent_versions v LEFT JOIN voice_agent_profiles p ON p.id = v.profile_id WHERE v.id = :versionId', { replacements: { versionId }, type: QueryTypes.SELECT });
  return { versionPublished: rows[0]?.status === 'published', profileId: rows[0]?.profile_id ?? null, engine: rows[0]?.engine ?? null, versionBrand: rows[0]?.brand ?? null, versionEngine: rows[0]?.engine ?? null };
}

/** Create or update one route. Returns null when the path key is already used by another route. */
export async function applyRouteChange(routeId: string | null, c: RouteChange, actor: string): Promise<{ id: string } | null> {
  const s = await db();
  const facts = await versionFacts(c.versionId);
  const engine = c.mode === 'legacy' || c.mode === 'disabled' ? 'synthflow_legacy' : (facts.engine ?? 'synthflow_legacy');
  const repl = {
    id: routeId, tenant: await tenant(), pathKey: c.pathKey, callType: c.callType, brand: c.brandSlug, engine, mode: c.mode, canary: c.canaryPercent,
    profileId: facts.profileId, versionId: c.versionId, fallback: JSON.stringify(c.fallback), actor,
  };
  try {
    const rows = routeId
      ? await s.query<{ id: string }>(
        `UPDATE voice_routes SET path_key = :pathKey, call_type = :callType, brand_slug = :brand, engine = :engine, mode = :mode, canary_percent = :canary,
                profile_id = :profileId, version_id = :versionId, fallback = CAST(:fallback AS jsonb), approved_by = :actor, approved_at = NOW(), updated_at = NOW()
          WHERE id = :id RETURNING id`, { replacements: repl, type: QueryTypes.SELECT })
      : await s.query<{ id: string }>(
        `INSERT INTO voice_routes (tenant_id, path_key, call_type, brand_slug, engine, mode, canary_percent, profile_id, version_id, fallback, approved_by, approved_at)
         VALUES (:tenant, :pathKey, :callType, :brand, :engine, :mode, :canary, :profileId, :versionId, CAST(:fallback AS jsonb), :actor, NOW()) RETURNING id`,
        { replacements: repl, type: QueryTypes.SELECT });
    return rows[0] ?? null;
  } catch (e) {
    if ((e as { name?: string }).name === 'SequelizeUniqueConstraintError') return null;
    throw e;
  }
}
