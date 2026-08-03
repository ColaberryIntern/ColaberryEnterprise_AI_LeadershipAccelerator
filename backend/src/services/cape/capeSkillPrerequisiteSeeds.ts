/**
 * capeSkillPrerequisiteSeeds — a small, explicitly-labeled STARTER graph for
 * `architecture_skill_prerequisites` (execution-contract.md Assumption 6). NOT the
 * full skill-taxonomy graph Phase 4 will eventually need — a data-contract seed that
 * lets `capeSkillPrerequisiteService` and its consumers have something real to read
 * while that fuller graph is designed. Follows the natural Week 0-1 -> Week 5+
 * curriculum order from design doc §8: foundations (LLM Core, Prompting, Context
 * Engineering) unlock the mid-program skills (Agents & MCP, RAG, System Design), which
 * in turn unlock the late-program skills (Governance, Deploy & Ops, Vectors).
 */
import ArchitectureSkillPrerequisite from '../../models/ArchitectureSkillPrerequisite';
import type { ArchitectureSkillId } from '../../constants/architectureSkills';

export interface SkillPrerequisiteSeed {
  skill_id: ArchitectureSkillId;
  prerequisite_skill_id: ArchitectureSkillId;
  min_placement: number;
}

export const SKILL_PREREQUISITE_SEEDS: SkillPrerequisiteSeed[] = [
  { skill_id: 'context_engineering', prerequisite_skill_id: 'llm_core', min_placement: 20 },
  { skill_id: 'agents_mcp', prerequisite_skill_id: 'llm_core', min_placement: 20 },
  { skill_id: 'agents_mcp', prerequisite_skill_id: 'prompting', min_placement: 20 },
  { skill_id: 'rag', prerequisite_skill_id: 'llm_core', min_placement: 20 },
  { skill_id: 'rag', prerequisite_skill_id: 'prompting', min_placement: 20 },
  { skill_id: 'vectors', prerequisite_skill_id: 'rag', min_placement: 20 },
  { skill_id: 'eval_guardrails', prerequisite_skill_id: 'llm_core', min_placement: 20 },
  { skill_id: 'system_design', prerequisite_skill_id: 'agents_mcp', min_placement: 30 },
  { skill_id: 'system_design', prerequisite_skill_id: 'context_engineering', min_placement: 20 },
  { skill_id: 'governance', prerequisite_skill_id: 'system_design', min_placement: 30 },
  { skill_id: 'deploy_ops', prerequisite_skill_id: 'agents_mcp', min_placement: 30 },
];

/** Idempotent: only inserts a pair that doesn't already exist (active or not) —
 * never overwrites an admin's later edit via `capeSkillPrerequisiteService.upsert`. */
export async function seedSkillPrerequisites(): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;
  for (const seed of SKILL_PREREQUISITE_SEEDS) {
    const [, wasCreated] = await ArchitectureSkillPrerequisite.findOrCreate({
      where: { skill_id: seed.skill_id, prerequisite_skill_id: seed.prerequisite_skill_id },
      defaults: {
        skill_id: seed.skill_id,
        prerequisite_skill_id: seed.prerequisite_skill_id,
        min_placement: seed.min_placement,
        is_active: true,
        created_by: 'system:capeSkillPrerequisiteSeeds',
      } as any,
    });
    if (wasCreated) created += 1; else skipped += 1;
  }
  return { created, skipped };
}
