/**
 * capeApi — typed client for the CAPE (Colaberry Adaptive Path Engine) Phase 0-1
 * endpoints: the learner skill profile (portal) and the minimal admin settings
 * panel (skill definitions + evidence-band weights). Types mirror
 * backend/src/schemas/capeSchema.ts — that file is the single source of truth;
 * keep these in sync by hand until a shared-types package exists.
 */
import portalApi from '../utils/portalApi';
import api from '../utils/api';

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
