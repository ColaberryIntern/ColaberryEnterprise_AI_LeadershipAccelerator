/**
 * capeApi — typed client for the CAPE (Colaberry Adaptive Path Engine) Phase 0-1
 * endpoints: the learner skill profile (portal) and the minimal admin settings
 * panel (skill definitions + evidence-band weights). Types mirror
 * backend/src/schemas/capeSchema.ts — that file is the single source of truth;
 * keep these in sync by hand until a shared-types package exists.
 *
 * Phase 5 additions (design doc §10, §11, §16 Phase 5) live at the bottom of
 * this file: the Today Plan, learner feedback controls, "Test out", and the
 * skill-detail drawer's evidence history.
 */
import portalApi from '../utils/portalApi';
import api from '../utils/api';
import type { TodayFeedItem } from '../pages/portal/today/todayFeedApi';

// ── Portal: learner skill profile ───────────────────────────────────────────

export interface SkillProfileEntry {
  skill_id: string;
  name: string;
  axis_order: number;
  placement: number;
  claim: number;
  knowledge: number;
  application: number;
  judgment: number;
  proficiency: number;
  confidence: number;
  next_review_at: string | null;
}

export interface LearnerSkillProfile {
  skills: SkillProfileEntry[];
  overall_placement: number;
  overall_proficiency: number;
  weights_version: number | null;
}

export async function fetchSkillProfile(): Promise<LearnerSkillProfile> {
  const { data } = await portalApi.get<LearnerSkillProfile>('/api/portal/cape/skill-profile');
  return data;
}

// ── Admin: skill definitions ────────────────────────────────────────────────

export interface SkillDefinition {
  id: string;
  skill_id: string;
  version: number;
  name: string;
  description: string | null;
  axis_order: number;
  crosswalk_competencies: string[];
  is_current: boolean;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpdateSkillDefinitionInput {
  name?: string;
  description?: string | null;
  axis_order?: number;
}

export async function fetchSkillDefinitions(): Promise<SkillDefinition[]> {
  const { data } = await api.get<{ ok: boolean; skills: SkillDefinition[] }>('/api/admin/cape/skill-definitions');
  return data.skills;
}

export async function fetchSkillDefinitionHistory(skillId: string): Promise<SkillDefinition[]> {
  const { data } = await api.get<{ ok: boolean; history: SkillDefinition[] }>(`/api/admin/cape/skill-definitions/${skillId}/history`);
  return data.history;
}

export async function updateSkillDefinition(
  skillId: string,
  patch: UpdateSkillDefinitionInput
): Promise<{ definition: SkillDefinition; versioned: boolean }> {
  const { data } = await api.put<{ ok: boolean; definition: SkillDefinition; versioned: boolean }>(
    `/api/admin/cape/skill-definitions/${skillId}`,
    patch
  );
  return { definition: data.definition, versioned: data.versioned };
}

// ── Admin: evidence-band weights ────────────────────────────────────────────

export interface EvidenceBandWeights {
  id: string;
  version: number;
  claim_weight: number;
  knowledge_weight: number;
  application_weight: number;
  judgment_weight: number;
  is_current: boolean;
  created_by: string | null;
  reason: string | null;
  created_at: string;
}

export interface UpdateEvidenceBandWeightsInput {
  claim_weight: number;
  knowledge_weight: number;
  application_weight: number;
  judgment_weight: number;
  reason?: string | null;
}

export async function fetchEvidenceBandWeights(): Promise<{ current: EvidenceBandWeights | null; history: EvidenceBandWeights[] }> {
  const { data } = await api.get<{ ok: boolean; current: EvidenceBandWeights | null; history: EvidenceBandWeights[] }>(
    '/api/admin/cape/evidence-band-weights'
  );
  return { current: data.current, history: data.history };
}

export async function updateEvidenceBandWeights(
  patch: UpdateEvidenceBandWeightsInput
): Promise<{ weights: EvidenceBandWeights; versioned: boolean }> {
  const { data } = await api.put<{ ok: boolean; weights: EvidenceBandWeights; versioned: boolean }>(
    '/api/admin/cape/evidence-band-weights',
    patch
  );
  return { weights: data.weights, versioned: data.versioned };
}

// ── Portal: CAPE Phase 5 — Today Plan + learner controls ───────────────────

export type TodayPlanSlot = 'next_best' | 'foundation' | 'practice' | 'ai_pulse' | 'review';
export type CardLevel = 'Foundation' | 'Working' | 'Stretch' | 'Architect';
export type CardProof = 'Learn' | 'Check' | 'Build' | 'Decide';
export type LifecycleMode = 'foundation' | 'experienced_cold_start' | 'active_builder' | 'architect_track' | 'returning_after_absence';

export interface CardChips {
  why_this: string;
  level: CardLevel;
  proof: CardProof;
}

export interface TodayPlanItem extends TodayFeedItem {
  slot: TodayPlanSlot;
  chips: CardChips;
}

export interface TodayPlanResponse {
  mode: LifecycleMode;
  items: TodayPlanItem[];
  estimated_total_minutes: number;
}

/** Returns `null` when the flag is off (404) rather than throwing — callers
 * (TodayPlan.tsx) treat a null plan the same as "nothing to show", never a
 * page-breaking error. */
export async function fetchTodayPlan(): Promise<TodayPlanResponse | null> {
  try {
    const { data } = await portalApi.get<TodayPlanResponse>('/api/portal/cape/today-plan');
    return data;
  } catch (err: any) {
    if (err?.response?.status === 404) return null;
    throw err;
  }
}

export type TodayPlanFeedbackAction =
  | 'more_like_this' | 'less_like_this' | 'already_know' | 'too_easy' | 'too_advanced' | 'not_interested';

export async function submitTodayPlanFeedback(ref: string, action: TodayPlanFeedbackAction): Promise<{ ok: true; created: boolean }> {
  const { data } = await portalApi.post<{ ok: true; created: boolean }>('/api/portal/cape/today-plan/feedback', { ref, action });
  return data;
}

/** Mirrors the shape `GET /api/portal/cape/diagnostic/:skillId` already
 * returns (capeDiagnosticService.startDiagnostic) — "Test out" reuses that
 * exact mechanism server-side, so the client shape is identical. */
export interface DiagnosticStartResult {
  attempt_id: string;
  skill_id: string;
  trigger: 'diagnostic_prompt' | 'test_out';
  items: Array<{ id: string; skill_id: string; kind: string; prompt: string; options: Array<{ id: string; label: string }> }>;
}

export async function startTestOut(ref: string): Promise<DiagnosticStartResult> {
  const { data } = await portalApi.post<DiagnosticStartResult>('/api/portal/cape/today-plan/test-out', { ref });
  return data;
}

/** Skill-first "Test out" entry point (design doc §11 skill-detail drawer) —
 * calls the EXISTING Phase 2 diagnostic route directly
 * (`GET /api/portal/cape/diagnostic/:skillId`, already live since Phase 2),
 * no new backend plumbing. Distinct from `startTestOut(ref)` above, which is
 * the card-first entry point from a Today Plan card. */
export async function fetchDiagnosticForSkill(skillId: string): Promise<DiagnosticStartResult> {
  const { data } = await portalApi.get<DiagnosticStartResult>(`/api/portal/cape/diagnostic/${encodeURIComponent(skillId)}`);
  return data;
}

export interface DiagnosticSubmitResult {
  outcome: 'confirmed' | 'partial' | 'not_confirmed';
  bridge_recommended: boolean;
  created: boolean;
}

/** Submits answers for either a system-prompted diagnostic or a "test out"
 * attempt — the EXISTING Phase 2 route, unchanged by Phase 5. */
export async function submitDiagnosticForSkill(
  skillId: string,
  attemptId: string,
  answers: Array<{ item_id: string; selected_option: string }>,
  trigger: 'diagnostic_prompt' | 'test_out' = 'test_out',
): Promise<DiagnosticSubmitResult> {
  const { data } = await portalApi.post<DiagnosticSubmitResult>(
    `/api/portal/cape/diagnostic/${encodeURIComponent(skillId)}/submit`,
    { attempt_id: attemptId, answers, trigger },
  );
  return data;
}

// ── Portal: CAPE Phase 5 — skill-detail drawer evidence history ────────────

export interface SkillEvidenceRow {
  band: string;
  credit: number;
  source: string;
  created_at: string;
}

export interface SkillEvidenceHistory {
  skill_id: string;
  placement: number;
  verified: number;
  evidence: SkillEvidenceRow[];
  next_review_at: string | null;
  next_recommended_proof: string | null;
}

export async function fetchSkillEvidenceHistory(skillId: string): Promise<SkillEvidenceHistory> {
  const { data } = await portalApi.get<SkillEvidenceHistory>(`/api/portal/cape/skill-profile/${encodeURIComponent(skillId)}/evidence`);
  return data;
}
