/**
 * Read side for Call Explorer, Trust Center, Quality and Costs (VS3.5). Read-only, bounded, and it
 * never selects a phone column: calls are identified by id and by masked provider id only.
 */
import { QueryTypes } from 'sequelize';
import type { TimelineInput } from './trustTimeline';

async function db() { return (await import('../../../config/database')).sequelize; }

export interface CallFilter { engine?: string; state?: string; testMode?: boolean; days: number; limit: number }
export interface CallListRow { id: string; engine: string; direction: string; state: string; purpose: string; test_mode: boolean; human_answered: boolean; duration_seconds: number | null; cost_usd: string | null; error_class: string | null; created_at: string }

export async function listCalls(f: CallFilter): Promise<CallListRow[]> {
  const s = await db();
  return s.query<CallListRow>(
    `SELECT id, engine, direction, state, purpose, test_mode, human_answered, duration_seconds, cost_usd, error_class, created_at
       FROM voice_calls
      WHERE created_at >= NOW() - (:days || ' days')::interval
        AND (CAST(:engine AS text) IS NULL OR engine = :engine)
        AND (CAST(:state AS text) IS NULL OR state = :state)
        AND (CAST(:test AS boolean) IS NULL OR test_mode = :test)
      ORDER BY created_at DESC LIMIT :limit`,
    { replacements: { days: f.days, engine: f.engine ?? null, state: f.state ?? null, test: f.testMode ?? null, limit: f.limit }, type: QueryTypes.SELECT });
}

export interface CallDetail extends TimelineInput {
  row: CallListRow & { provider_call_id_masked: string | null; consent_ref: string | null; answered_at: string | null; ended_at: string | null };
  turns: Array<{ turn_index: number; speaker: string; first_audio_latency_ms: number | null; interrupted: boolean; started_at: string }>;
  usage: Array<{ provider: string; unit: string; quantity: string; unit_price_usd: string | null; measured: boolean }>;
  reconciliation: { logged: boolean; logStatus: string | null; transcriptState: string | null };
}

export async function getCallDetail(id: string): Promise<CallDetail | null> {
  const s = await db();
  const q = <T extends object>(sql: string) => s.query<T>(sql, { replacements: { id }, type: QueryTypes.SELECT });
  const [row] = await q<CallDetail['row'] & { profile_version_id: string | null }>(
    `SELECT id, engine, direction, state, purpose, test_mode, human_answered, duration_seconds, cost_usd, error_class, created_at, consent_ref, answered_at, ended_at, profile_version_id,
            CASE WHEN provider_call_id IS NULL THEN NULL ELSE left(provider_call_id, 2) || '****' || right(provider_call_id, 4) END AS provider_call_id_masked
       FROM voice_calls WHERE id = :id`);
  if (!row) return null;
  const [events, tools, turns, usage, [log]] = await Promise.all([
    q<TimelineInput['events'][number]>('SELECT id, source, state, occurred_at FROM voice_call_events WHERE call_id = :id ORDER BY seq LIMIT 500'),
    q<TimelineInput['tools'][number]>('SELECT id, tool_name, auth_decision, status, started_at FROM voice_tool_runs WHERE call_id = :id ORDER BY started_at LIMIT 200'),
    q<CallDetail['turns'][number]>('SELECT turn_index, speaker, first_audio_latency_ms, interrupted, started_at FROM voice_turns WHERE call_id = :id ORDER BY turn_index LIMIT 500'),
    q<CallDetail['usage'][number]>('SELECT provider, unit, quantity, unit_price_usd, measured FROM voice_usage WHERE call_id = :id ORDER BY created_at LIMIT 200'),
    q<{ status: string; ts: string | null }>("SELECT l.status, l.provider_response->>'transcript_state' AS ts FROM voice_calls c JOIN communication_logs l ON l.id = c.communication_log_id WHERE c.id = :id"),
  ]);
  const version = row.profile_version_id
    ? (await s.query<NonNullable<TimelineInput['version']>>('SELECT id, version, author, approved_by, approved_at FROM voice_agent_versions WHERE id = :v', { replacements: { v: row.profile_version_id }, type: QueryTypes.SELECT }))[0] ?? null
    : null;
  return { row, call: row, events, tools, version, turns, usage, reconciliation: { logged: !!log, logStatus: log?.status ?? null, transcriptState: log?.ts ?? null } };
}

export interface EvaluationRow { id: string; engine: string; scenario_set: string; environment: string; verdict: string; evidence_ref: string | null; created_at: string }
/** Evaluation runs with recorded evidence. Blind A/B trials are listed without their voices. */
export async function listEvaluations(): Promise<EvaluationRow[]> {
  const s = await db();
  return s.query<EvaluationRow>('SELECT id, engine, scenario_set, environment, verdict, evidence_ref, created_at FROM voice_evaluation_runs ORDER BY created_at DESC LIMIT 100', { type: QueryTypes.SELECT });
}

export interface CostRows {
  byProvider: Array<{ provider: string; measured: boolean; usd: string | null; rows: number; unpriced: number }>;
  activeCalls: number;
  reservations: Array<{ status: string; n: number }>;
  deadLetters: Array<{ id: string; state: string; error_class: string | null; created_at: string }>;
}

export async function loadCosts(days: number): Promise<CostRows> {
  const s = await db();
  const r = { replacements: { days }, type: QueryTypes.SELECT as const };
  const byProvider = await s.query<CostRows['byProvider'][number]>(
    `SELECT provider, measured, SUM(quantity * unit_price_usd)::text AS usd, COUNT(*)::int AS rows, COUNT(*) FILTER (WHERE unit_price_usd IS NULL)::int AS unpriced
       FROM voice_usage WHERE created_at >= NOW() - (:days || ' days')::interval GROUP BY provider, measured ORDER BY provider, measured`, r);
  const [active] = await s.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM voice_calls WHERE state IN ('dispatching','queued','ringing','answered','session_active') AND created_at > NOW() - INTERVAL '1 day'", { type: QueryTypes.SELECT });
  const reservations = await s.query<CostRows['reservations'][number]>(
    `SELECT status, COUNT(*)::int AS n FROM voice_dial_reservations WHERE created_at >= NOW() - (:days || ' days')::interval GROUP BY status ORDER BY status`, r);
  const deadLetters = await s.query<CostRows['deadLetters'][number]>(
    `SELECT id, state, error_class, created_at FROM voice_calls WHERE state = 'dispatch_unknown' AND created_at >= NOW() - (:days || ' days')::interval ORDER BY created_at DESC LIMIT 50`, r);
  return { byProvider, activeCalls: active?.n ?? 0, reservations, deadLetters };
}
