import api from '../utils/api';

/**
 * voiceStudioApi: the Voice Studio console's calls (VS3.3). Every route is under
 * /api/admin/voice-studio and does not exist (404) unless VOICE_STUDIO_UI_ENABLED is on.
 * Shapes mirror backend/src/services/voice/studio/overviewMetrics.ts and
 * backend/src/services/voice/profiles/profileTypes.ts / versionContent.ts.
 */

export type Provenance = 'observed' | 'estimated' | 'simulated';
export type OverviewMode = 'live' | 'test';

export interface Kpi {
  key: string;
  label: string;
  /** null means there is no data for this KPI. It is never shown as 0. */
  value: number | null;
  unit: 'count' | 'percent' | 'ms' | 'usd_per_min';
  provenance: Provenance;
  denominator?: { label: string; value: number };
}

export interface Overview {
  window: { days: number; mode: OverviewMode };
  kpis: Kpi[];
  byEngine: Array<{ engine: string; attempted: number; completed: number; successPercent: number | null }>;
  safety: { studioEnabled: boolean; testEnabled: boolean; gatewayLegacyEnabled: boolean; engineDefault: string };
  migration: { legacy: number; shadow: number; test: number; canary: number; live: number; disabled: number; total: number };
}

export type VersionStatus = 'draft' | 'approved' | 'published' | 'retired';

export interface VersionContent {
  prompt: string;
  first_message: string | null;
  disclosure: string;
  kb_refs: string[];
  tool_permissions: string[];
  engine: 'conversation_relay' | 'openai_realtime';
  engine_config: { promptShell?: boolean; voice?: string };
  voice_id: string | null;
  language: string;
  safety_policy: { bookingRequiresHumanApproval: true; maxToolCallsPerCall: number };
  max_call_seconds: number;
}

export interface AgentVersion extends VersionContent {
  id: string;
  profile_id: string;
  version: number;
  content_hash: string;
  author: string;
  approved_by: string | null;
  approved_at: string | null;
  status: VersionStatus;
  created_at: string;
}

export interface AgentCard {
  profile: { id: string; name: string; brand_slug: string; agent_key: string; direction: string; status: string; active_version_id: string | null; updated_at: string };
  versions: { total: number; drafts: number; approved: number };
  active: { id: string; version: number; engine: string; language: string; content_hash: string; approved_by: string | null; approved_at: string | null } | null;
}

export type ValidateResult =
  | { valid: false; issues: string[] }
  | { valid: true; hash: string; preview: { ok: true; system: string; greeting: string } | { ok: false; reason: string };
      tools: { allowed: string[]; denied: Array<{ name: string; reason: string }> } };

export async function getOverview(days: number, mode: OverviewMode): Promise<Overview> {
  const { data } = await api.get<Overview>('/api/admin/voice-studio/overview', { params: { days, mode } });
  return data;
}

export async function listAgents(): Promise<AgentCard[]> {
  const { data } = await api.get<{ agents: AgentCard[] }>('/api/admin/voice-studio/agents');
  return data.agents;
}

export async function listVersions(profileId: string): Promise<AgentVersion[]> {
  const { data } = await api.get<{ versions: AgentVersion[] }>(`/api/admin/voice-studio/agents/${encodeURIComponent(profileId)}/versions`);
  return data.versions;
}

export async function validateContent(profileId: string, content: VersionContent, samplePrompt?: string): Promise<ValidateResult> {
  const { data } = await api.post<ValidateResult>(`/api/admin/voice-studio/agents/${encodeURIComponent(profileId)}/validate`, { content, samplePrompt });
  return data;
}

export async function saveDraft(profileId: string, content: VersionContent): Promise<{ version: AgentVersion; created: boolean }> {
  const { data } = await api.post<{ version: AgentVersion; created: boolean }>(`/api/admin/voice-studio/agents/${encodeURIComponent(profileId)}/versions`, { content });
  return data;
}

export type LifecycleAction = 'approve' | 'publish' | 'retire';

export async function changeStatus(versionId: string, action: LifecycleAction): Promise<AgentVersion> {
  const { data } = await api.post<{ version: AgentVersion }>(`/api/admin/voice-studio/versions/${encodeURIComponent(versionId)}/${action}`);
  return data.version;
}

/** HTTP status of a failed call, or null when the request never got a response. */
export function statusOf(err: unknown): number | null {
  const s = (err as { response?: { status?: unknown } })?.response?.status;
  return typeof s === 'number' ? s : null;
}

/** A plain-English message for a failed console call. */
export function studioErrorMessage(err: unknown, fallback: string): string {
  const status = statusOf(err);
  if (status === 403) return 'This needs an approver role. Ask an owner or a full admin to approve or publish.';
  if (status === 404) return 'The Voice Studio console is switched off on this server.';
  const msg = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof msg === 'string' && msg ? msg : fallback;
}

/* ── Voice Lab and Numbers & Routing (VS3.4) ─────────────────────────────────── */

export interface CatalogVoice { engine: 'openai_realtime' | 'conversation_relay'; id: string; label: string; recommended: boolean; preview: 'tts_approximation' | 'test_call_only'; source: string }

export interface AbTrial {
  trialId: string;
  text: string;
  scored: boolean;
  preferred?: 'X' | 'Y' | 'tie';
  /** Present only after scoring: which voice each label was. */
  reveal?: { X: string; Y: string };
}

export interface NumberRow { id: string; provider: string; provider_number_id: string; number_ref: string; ownership: string; status: string; capabilities: Record<string, unknown>; routing_policy: Record<string, unknown>; brand_slug: string | null; verified_caller_id: boolean }
export interface RouteRow { id: string; path_key: string; call_type: string; brand_slug: string; engine: string; mode: string; canary_percent: number; version_id: string | null; fallback: { kind?: string; ref?: string }; approved_by: string | null; approved_at: string | null; calls_7d: number }

export interface RouteChange {
  pathKey: string; callType: string; brandSlug: string; mode: string; canaryPercent: number; versionId: string | null;
  fallback: { kind: string; ref?: string }; confirm?: string;
}
export type RouteValidation =
  | { ok: false; issues: string[] }
  | { ok: true; validationToken: string; impact: { callsLast7Days: number; currentMode: string | null; movesRealCallers: boolean; summary: string } };

export async function getCatalog(): Promise<CatalogVoice[]> {
  const { data } = await api.get<{ voices: CatalogVoice[] }>('/api/admin/voice-studio/lab/catalog');
  return data.voices;
}

async function audioUrl(url: string, body?: unknown): Promise<string> {
  const res = body === undefined ? await api.get<Blob>(url, { responseType: 'blob' }) : await api.post<Blob>(url, body, { responseType: 'blob' });
  return URL.createObjectURL(res.data);
}

export const previewVoice = (voice: string, text: string): Promise<string> => audioUrl('/api/admin/voice-studio/lab/preview', { voice, text });

export async function createTrial(voiceA: string, voiceB: string, text: string): Promise<AbTrial> {
  const { data } = await api.post<AbTrial>('/api/admin/voice-studio/lab/ab', { voiceA, voiceB, text });
  return data;
}

export const trialClip = (trialId: string, label: 'X' | 'Y'): Promise<string> => audioUrl(`/api/admin/voice-studio/lab/ab/${encodeURIComponent(trialId)}/clip/${label}`);

export async function scoreTrial(trialId: string, preferred: 'X' | 'Y' | 'tie'): Promise<AbTrial> {
  const { data } = await api.post<AbTrial>(`/api/admin/voice-studio/lab/ab/${encodeURIComponent(trialId)}/score`, { preferred });
  return data;
}

export async function listNumbers(): Promise<NumberRow[]> {
  const { data } = await api.get<{ numbers: NumberRow[] }>('/api/admin/voice-studio/numbers');
  return data.numbers;
}

export async function listRoutes(): Promise<RouteRow[]> {
  const { data } = await api.get<{ routes: RouteRow[] }>('/api/admin/voice-studio/routes');
  return data.routes;
}

export async function validateRoute(routeId: string | null, change: RouteChange): Promise<RouteValidation> {
  const { data } = await api.post<RouteValidation>('/api/admin/voice-studio/routes/validate', { routeId, change });
  return data;
}

export async function applyRoute(routeId: string | null, change: RouteChange, validationToken: string): Promise<void> {
  await api.post('/api/admin/voice-studio/routes/apply', { routeId, change, validationToken });
}

/** The Test Lab's published spend ceiling per test run, shown before a live test. */
export const TEST_RUN_ESTIMATE_USD = 1.04;

export async function startTestCall(runId: string, engine: 'conversation_relay' | 'openai_realtime'): Promise<{ callId?: string; error?: string }> {
  const { data } = await api.post('/api/admin/voice-studio/tests', { runId, destinationId: 'test-allowed', engine, script: 'smoke', confirm: true });
  return data as { callId?: string; error?: string };
}

export async function stopTestCall(callId: string): Promise<void> {
  await api.post(`/api/admin/voice-studio/tests/${encodeURIComponent(callId)}/stop`);
}
