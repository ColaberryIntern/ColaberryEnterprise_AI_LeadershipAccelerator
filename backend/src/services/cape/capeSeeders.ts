/**
 * capeSeeders — idempotent seeders for the CAPE (Colaberry Adaptive Path Engine)
 * Phase 0-1 config: the 10 versioned Architecture Skill definitions (+ crosswalk to
 * the 11 existing promotion competencies) and the default evidence-band weights.
 * Same shape as backend/src/services/progression/seeders.ts (findOrCreate by
 * natural key so re-running boot is a no-op); wired into server.ts next to
 * seedProgressionConfig().
 */
import ArchitectureSkillDefinition from '../../models/ArchitectureSkillDefinition';
import ArchitectureSkillEvidenceBandWeights from '../../models/ArchitectureSkillEvidenceBandWeights';
import type { ArchitectureSkillId } from '../../constants/architectureSkills';

export interface SkillDefinitionSeed {
  skill_id: ArchitectureSkillId;
  name: string;
  description: string;
  axis_order: number;
  crosswalk_competencies: string[];
}

// Design doc §3 (10-axis table) + crosswalk table. Order matches §3 exactly — this
// IS the radar's axis order. llm_core/rag/vectors crosswalk to the "based on actual
// evidence" set the doc names rather than a single fixed competency, per §3's note:
// "New learning axes; verified artifacts crosswalk to architecture, testing, or
// context_engineering based on actual evidence."
const EVIDENCE_BASED_CROSSWALK = ['architecture', 'testing', 'context_engineering'];

export const ARCHITECTURE_SKILL_DEFINITION_SEEDS: SkillDefinitionSeed[] = [
  { skill_id: 'llm_core', axis_order: 0, name: 'LLM Core',
    description: 'Model behavior, limits, tokens/context, structured output, model selection, cost/latency tradeoffs.',
    crosswalk_competencies: EVIDENCE_BASED_CROSSWALK },
  { skill_id: 'prompting', axis_order: 1, name: 'Prompting',
    description: 'Reusable prompt design, testing, versioning, decomposition, prompt systems.',
    crosswalk_competencies: ['prompt_engineering'] },
  { skill_id: 'rag', axis_order: 2, name: 'RAG',
    description: 'Retrieval design, chunking, grounding, citations, freshness, evaluation.',
    crosswalk_competencies: EVIDENCE_BASED_CROSSWALK },
  { skill_id: 'vectors', axis_order: 3, name: 'Vectors',
    description: 'Embeddings, vector stores, similarity, hybrid retrieval, indexing tradeoffs.',
    crosswalk_competencies: EVIDENCE_BASED_CROSSWALK },
  { skill_id: 'agents_mcp', axis_order: 4, name: 'Agents & MCP',
    description: 'Tool use, agents, skills, subagents, MCP servers, coordination, boundaries.',
    crosswalk_competencies: ['architecture', 'context_engineering', 'deployment'] },
  { skill_id: 'eval_guardrails', axis_order: 5, name: 'Eval & Guardrails',
    description: 'Evals, quality gates, safety, reliability, abstention, escalation, red-team thinking.',
    crosswalk_competencies: ['testing', 'debugging', 'security'] },
  { skill_id: 'system_design', axis_order: 6, name: 'System Design',
    description: 'Boundaries, data flow, orchestration, patterns, tradeoffs, architecture decisions.',
    crosswalk_competencies: ['architecture', 'documentation', 'leadership'] },
  { skill_id: 'context_engineering', axis_order: 7, name: 'Context Engineering',
    description: 'Context selection, memory, instructions, retrieval, compacting, state.',
    crosswalk_competencies: ['context_engineering'] },
  { skill_id: 'governance', axis_order: 8, name: 'Governance',
    description: 'Access, privacy, audit, HITL, authority, risk, ownership.',
    crosswalk_competencies: ['security', 'leadership', 'communication', 'documentation'] },
  { skill_id: 'deploy_ops', axis_order: 9, name: 'Deploy & Ops',
    description: 'Testing, CI/CD, observability, secrets, deployment, reliability, cost and incident response.',
    crosswalk_competencies: ['deployment', 'testing', 'debugging', 'github'] },
];

// Design doc §6 default weights: claim 20%, knowledge 25%, application 35%, judgment 20%.
export const DEFAULT_EVIDENCE_BAND_WEIGHTS = {
  claim_weight: 0.2,
  knowledge_weight: 0.25,
  application_weight: 0.35,
  judgment_weight: 0.2,
};

/** Idempotent: only inserts a skill_id's version-1 row if no current row exists yet. */
export async function seedArchitectureSkillDefinitions(): Promise<number> {
  let n = 0;
  for (const s of ARCHITECTURE_SKILL_DEFINITION_SEEDS) {
    const [, created] = await ArchitectureSkillDefinition.findOrCreate({
      where: { skill_id: s.skill_id, is_current: true },
      defaults: {
        skill_id: s.skill_id,
        version: 1,
        name: s.name,
        description: s.description,
        axis_order: s.axis_order,
        crosswalk_competencies: s.crosswalk_competencies,
        is_current: true,
        is_active: true,
      },
    });
    if (created) n += 1;
  }
  return n;
}

/** Idempotent: seeds version-1 default weights only if no current row exists yet. */
export async function seedEvidenceBandWeights(): Promise<number> {
  const existing = await ArchitectureSkillEvidenceBandWeights.findOne({ where: { is_current: true } });
  if (existing) return 0;
  await ArchitectureSkillEvidenceBandWeights.create({
    version: 1,
    ...DEFAULT_EVIDENCE_BAND_WEIGHTS,
    is_current: true,
    reason: 'initial seed — design doc §6 default',
  });
  return 1;
}

export async function seedCapeConfig(): Promise<{ skillDefinitions: number; weights: number }> {
  return {
    skillDefinitions: await seedArchitectureSkillDefinitions(),
    weights: await seedEvidenceBandWeights(),
  };
}
