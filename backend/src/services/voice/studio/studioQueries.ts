/**
 * Voice Studio read side (VS3.3): the queries behind the Overview and Agents tabs. Read-only; every
 * write goes through profiles/profileStore.ts. Rows are typed at the call site (CLAUDE.md contract).
 * Nothing here returns a phone number: voice_numbers.e164_restricted is never selected.
 */
import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import { VoiceAgentProfile, VoiceAgentVersion } from '../../../models/voiceStudioModels';
import type { VoiceAgentProfileAttrs, VoiceAgentVersionAttrs } from '../profiles/profileTypes';
import type { CallRow, OverviewMode, RouteRow, UsageRow } from './overviewMetrics';

const plain = <T>(row: unknown): T => (row as { get: (o: { plain: true }) => T }).get({ plain: true });

/** Hard ceiling on rows read for one Overview, so a large window cannot exhaust memory. */
export const OVERVIEW_ROW_CAP = 50_000;

export interface OverviewRows { calls: CallRow[]; agentLatenciesMs: number[]; usage: UsageRow[]; activeReservations: number; routes: RouteRow[] }

export async function loadOverviewRows(mode: OverviewMode, windowDays: number): Promise<OverviewRows> {
  const r = { days: windowDays, test: mode === 'test', cap: OVERVIEW_ROW_CAP };
  const calls = await sequelize.query<CallRow>(
    `SELECT state, engine, state_reason, carrier_answered, human_answered, session_succeeded, duration_seconds, cost_usd
       FROM voice_calls WHERE created_at >= NOW() - (:days || ' days')::interval AND test_mode = :test
      ORDER BY created_at DESC LIMIT :cap`, { replacements: r, type: QueryTypes.SELECT });
  const lat = await sequelize.query<{ ms: number }>(
    `SELECT t.first_audio_latency_ms AS ms FROM voice_turns t JOIN voice_calls c ON c.id = t.call_id
      WHERE c.created_at >= NOW() - (:days || ' days')::interval AND c.test_mode = :test
        AND t.speaker = 'agent' AND t.first_audio_latency_ms IS NOT NULL LIMIT :cap`, { replacements: r, type: QueryTypes.SELECT });
  const usage = await sequelize.query<UsageRow>(
    `SELECT u.measured FROM voice_usage u JOIN voice_calls c ON c.id = u.call_id
      WHERE c.created_at >= NOW() - (:days || ' days')::interval AND c.test_mode = :test LIMIT :cap`, { replacements: r, type: QueryTypes.SELECT });
  const [res] = await sequelize.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM voice_dial_reservations WHERE status IN ('held','dispatching') AND lease_expires_at > NOW()`, { type: QueryTypes.SELECT });
  const routes = await sequelize.query<RouteRow>('SELECT mode FROM voice_routes', { type: QueryTypes.SELECT });
  return { calls, agentLatenciesMs: lat.map((x) => Number(x.ms)), usage, activeReservations: res?.n ?? 0, routes };
}

export interface AgentCard {
  profile: Pick<VoiceAgentProfileAttrs, 'id' | 'name' | 'brand_slug' | 'agent_key' | 'direction' | 'status' | 'active_version_id' | 'updated_at'>;
  versions: { total: number; drafts: number; approved: number };
  active: Pick<VoiceAgentVersionAttrs, 'id' | 'version' | 'engine' | 'language' | 'content_hash' | 'approved_by' | 'approved_at'> | null;
}

export async function listAgentCards(): Promise<AgentCard[]> {
  const profiles = (await VoiceAgentProfile.findAll({ order: [['name', 'ASC']], limit: 200 })).map((p) => plain<VoiceAgentProfileAttrs>(p));
  if (!profiles.length) return [];
  const versions = (await VoiceAgentVersion.findAll({
    where: { profile_id: { [Op.in]: profiles.map((p) => p.id) } },
    attributes: ['id', 'profile_id', 'version', 'engine', 'language', 'content_hash', 'approved_by', 'approved_at', 'status'],
  })).map((v) => plain<VoiceAgentVersionAttrs>(v));
  return profiles.map((p) => {
    const mine = versions.filter((v) => v.profile_id === p.id);
    const a = mine.find((v) => v.id === p.active_version_id && v.status === 'published') ?? null;
    return {
      profile: { id: p.id, name: p.name, brand_slug: p.brand_slug, agent_key: p.agent_key, direction: p.direction, status: p.status, active_version_id: p.active_version_id, updated_at: p.updated_at },
      versions: { total: mine.length, drafts: mine.filter((v) => v.status === 'draft').length, approved: mine.filter((v) => v.status === 'approved').length },
      active: a ? { id: a.id, version: a.version, engine: a.engine, language: a.language, content_hash: a.content_hash, approved_by: a.approved_by, approved_at: a.approved_at } : null,
    };
  });
}

export async function listVersions(profileId: string): Promise<VoiceAgentVersionAttrs[] | null> {
  const p = await VoiceAgentProfile.findByPk(profileId);
  if (!p) return null;
  return (await VoiceAgentVersion.findAll({ where: { profile_id: profileId }, order: [['version', 'DESC']], limit: 100 })).map((v) => plain<VoiceAgentVersionAttrs>(v));
}

export async function getVersion(versionId: string): Promise<VoiceAgentVersionAttrs | null> {
  const v = await VoiceAgentVersion.findByPk(versionId);
  return v ? plain<VoiceAgentVersionAttrs>(v) : null;
}

export async function getProfile(profileId: string): Promise<VoiceAgentProfileAttrs | null> {
  const p = await VoiceAgentProfile.findByPk(profileId);
  return p ? plain<VoiceAgentProfileAttrs>(p) : null;
}
