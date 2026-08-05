import type { ArchitectureSkillId } from './architectureSkills';

/**
 * Deterministic, single-valued inverse of the design doc §3 crosswalk table: turns a
 * card's legacy 11-domain promotion `competencies` tag into an Architecture Skill id.
 * Several competencies legitimately crosswalk to more than one Architecture Skill (see
 * `capeSeeders.ts`'s `crosswalk_competencies` on each skill definition); this picks one
 * deterministic primary per competency so the resulting mapping is reproducible.
 *
 * Shared by:
 *  - `capeTypeSkillMapSeeds.ts` (CAPE Phase 3) — the REAL mapping source, deriving
 *    `curriculum_skill_maps` type-default rows for every registered Curriculum Type.
 *  - `capeTimelineEvidenceBridge.ts` — historically had its own local copy (Phase 0-1's
 *    explicitly-temporary placeholder); moved here in Phase 3 so there is one source of
 *    truth instead of two copies drifting apart.
 */
export const COMPETENCY_TO_SKILL: Record<string, ArchitectureSkillId> = {
  prompt_engineering: 'prompting',
  context_engineering: 'context_engineering',
  architecture: 'system_design',
  testing: 'eval_guardrails',
  debugging: 'eval_guardrails',
  deployment: 'deploy_ops',
  github: 'deploy_ops',
  communication: 'governance',
  leadership: 'governance',
  security: 'governance',
  documentation: 'system_design',
  claude_code: 'agents_mcp',
  systems_thinking: 'system_design',
  decision_making: 'system_design',
  tradeoffs: 'system_design',
  ai_governance: 'governance',
};
