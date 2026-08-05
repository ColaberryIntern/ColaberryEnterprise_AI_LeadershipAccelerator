/**
 * The canonical 10 CAPE Architecture Skill ids (design doc §3), in radar axis
 * order. Deliberately dependency-free (no Sequelize import) so anything that
 * needs the id set/type — Zod schemas, services, tests — never has to pull in a
 * live Sequelize model (and its `.init()` call against a real `sequelize`
 * instance) just to reference the enum. `ArchitectureSkillDefinition.ts`
 * re-exports these for backward-compatible imports from the model module.
 */
export const ARCHITECTURE_SKILL_IDS = [
  'llm_core', 'prompting', 'rag', 'vectors', 'agents_mcp',
  'eval_guardrails', 'system_design', 'context_engineering', 'governance', 'deploy_ops',
] as const;

export type ArchitectureSkillId = typeof ARCHITECTURE_SKILL_IDS[number];
