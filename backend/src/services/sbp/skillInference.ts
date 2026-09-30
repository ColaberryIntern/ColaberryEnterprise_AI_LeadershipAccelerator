/**
 * skillInference — the ten architecture skills, inferred from what was COMMITTED. PURE.
 *
 * Step 4 of the portfolio plan, and the replacement for a number that should never have
 * been published. The public page used to read "System Design - Verified by Colaberry -
 * 240 pieces of evidence" from `student_architecture_skill`; every one of those 8,895 rows
 * platform-wide is `source = 'timeline'`, meaning curriculum content opened, counted once
 * per band. That is attendance. This module answers the same question from artefacts the
 * student actually built.
 *
 * ── EVERY CLAIM CARRIES ITS BASIS ───────────────────────────────────────────
 *
 * An inferred skill is worthless on a portfolio unless the student can point at the file
 * when a recruiter asks. So `basis` is not decoration: it is the specific, checkable
 * reason the skill is listed, and a skill with no basis is not emitted at all. There is no
 * score, no proficiency, no confidence — those were the fields that made the old band
 * sound authoritative while meaning nothing.
 *
 * ── WHAT THIS CANNOT KNOW ───────────────────────────────────────────────────
 *
 * The tree carries paths. A `governance/` directory shows the student built a governance
 * layer; it cannot show the layer is correct, complete, or that they understand it. So the
 * vocabulary here is deliberately "built" and "shipped", never "expert" or "proficient".
 * The distinction is the whole reason this can go in front of an employer at all.
 *
 * PURE. No I/O, no clock. Same inputs, identical output, so the compiler stays
 * deterministic and an unchanged record is not rewritten.
 */

import type { RepoSignals } from './repoSignals';

/** The ten canonical architecture skills, as `student_architecture_skill` names them. */
export type SkillId =
  | 'system_design' | 'governance' | 'eval_guardrails' | 'deploy_ops' | 'agents_mcp'
  | 'context_engineering' | 'prompting' | 'rag' | 'llm_core' | 'vectors';

export interface InferredSkill {
  skill_id: SkillId;
  label: string;
  /**
   * The checkable reasons this skill is listed. Never empty — a skill with no basis is
   * not emitted, because a claim a student cannot source is a claim that damages them.
   */
  basis: string[];
}

const LABEL: Record<SkillId, string> = {
  system_design: 'System design',
  governance: 'Governance',
  eval_guardrails: 'Evaluation and guardrails',
  deploy_ops: 'Deployment and operations',
  agents_mcp: 'Agents and MCP',
  context_engineering: 'Context engineering',
  prompting: 'Prompting',
  rag: 'Retrieval-augmented generation',
  llm_core: 'LLM fundamentals',
  vectors: 'Vector search',
};

/** A capability entry as the inventory produces it. */
export interface CapabilityLike {
  id: string;
  present?: boolean;
  count?: number;
}

export interface InferenceInput {
  signals: RepoSignals;
  /** Merged capability inventory. Already ratcheted by the caller. */
  capabilities?: CapabilityLike[];
  /** Lowercased repo paths. The evidence of last resort for skills with no capability. */
  paths?: string[];
}

/**
 * Capability id to the skill it evidences, with the sentence that explains why.
 *
 * Driven by `CAPABILITIES` in capabilityInventory: these are the artefacts the labs
 * actually ask students to build, so a present capability is a committed artefact and not
 * an inference about one.
 */
const CAPABILITY_EVIDENCE: Record<string, { skill: SkillId; because: string }> = {
  WORKSPACE: { skill: 'context_engineering', because: 'Built an architect workspace (CLAUDE.md)' },
  SKILLS: { skill: 'context_engineering', because: 'Committed a set of agent skills' },
  PROMPT_LIBRARY: { skill: 'prompting', because: 'Committed a prompt library' },
  MCP_SERVER: { skill: 'agents_mcp', because: 'Built an MCP server' },
  AGENTS: { skill: 'agents_mcp', because: 'Built a team of subagents' },
  AUTOMATION: { skill: 'deploy_ops', because: 'Built an automation platform' },
  RELIABILITY: { skill: 'eval_guardrails', because: 'Built a reliability layer' },
  GOVERNANCE: { skill: 'governance', because: 'Built a governance engine' },
  ARCHITECTURE: { skill: 'system_design', because: 'Committed an architecture package' },
  WORKFLOW_ASSISTANT: { skill: 'agents_mcp', because: 'Built a workflow assistant' },
};

/**
 * Path fragments that evidence a skill no capability covers.
 *
 * Narrow on purpose. `rag/` is unambiguous; a file merely mentioning "search" is not, and
 * a false skill on a portfolio is worse than a missing one — the student gets asked about
 * something they never did.
 */
const PATH_EVIDENCE: Array<{ skill: SkillId; match: (p: string) => boolean; because: string }> = [
  { skill: 'rag', because: 'Committed retrieval code',
    match: (p) => p.startsWith('rag/') || p.includes('/rag/') || p.includes('retriev') },
  { skill: 'vectors', because: 'Committed vector search code',
    match: (p) => p.includes('embedding') || p.includes('vectorstore') || p.includes('vector_store')
      || p.startsWith('vectors/') || p.includes('/vectors/') },
  { skill: 'llm_core', because: 'Committed model integration code',
    match: (p) => p.includes('/llm/') || p.startsWith('llm/') || p.includes('completion')
      || p.includes('anthropic') || p.includes('openai') },
  { skill: 'eval_guardrails', because: 'Committed evaluation code',
    match: (p) => p.startsWith('eval/') || p.includes('/eval/') || p.includes('guardrail') },
  { skill: 'governance', because: 'Committed directives governing the system',
    match: (p) => p.startsWith('directives/') || p.includes('/directives/') },
];

/**
 * Infer the skills a repository evidences.
 *
 * Order of trust, strongest first:
 *   1. a PRESENT capability — an artefact the labs asked for and the student committed
 *   2. an unambiguous path — code of a recognisable kind
 *   3. a structural practice — containerisation, CI, tests, full-stack shape
 *
 * A skill reached by more than one route accumulates its reasons rather than repeating
 * itself, so the basis reads as a case rather than a list of near-duplicates.
 */
export function inferSkills(input: InferenceInput): InferredSkill[] {
  const reasons = new Map<SkillId, string[]>();
  const add = (skill: SkillId, because: string) => {
    const list = reasons.get(skill) ?? [];
    if (!list.includes(because)) list.push(because);
    reasons.set(skill, list);
  };

  // 1. Capabilities — the strongest evidence, because the lab asked for the artefact and
  //    the reader can open it.
  //
  // `Array.isArray`, not `?? []`: the nullish guard passes a number or a string straight
  // into the loop, where `for...of` throws. A malformed input must produce a shorter
  // portfolio, never take a student's whole page down.
  const caps = Array.isArray(input.capabilities) ? input.capabilities : [];
  for (const cap of caps) {
    if (!cap || cap.present !== true) continue;
    const hit = CAPABILITY_EVIDENCE[cap.id];
    if (!hit) continue;
    const n = typeof cap.count === 'number' && cap.count > 1 ? ` (${cap.count})` : '';
    add(hit.skill, hit.because + n);
  }

  // 2. Paths, for skills no capability covers.
  const paths = Array.isArray(input.paths) ? input.paths : [];
  for (const rule of PATH_EVIDENCE) {
    if (paths.some((p) => typeof p === 'string' && rule.match(p))) add(rule.skill, rule.because);
  }

  // 3. Structural practices. Weakest, and phrased as what was observed rather than as a
  //    competence: "Containerised the system" is checkable; "knows Docker" is not.
  const s = input.signals;
  const pr = s?.practices;
  if (pr?.containerised) add('deploy_ops', 'Containerised the system');
  if (pr?.continuous_integration) add('deploy_ops', 'Set up continuous integration');
  if (pr?.tested) add('eval_guardrails', 'Committed a test suite');
  if (pr?.full_stack) add('system_design', 'Built both a server and a client surface');
  if (pr?.documented) add('context_engineering', 'Documented the system');
  if ((s?.structure?.length ?? 0) >= 5) {
    add('system_design', `Organised the work across ${s.structure.length} top-level areas`);
  }

  return [...reasons.entries()]
    // A skill with no basis is not emitted. There is no path to an empty-basis entry here,
    // and the filter states that as an invariant rather than trusting the construction.
    .filter(([, basis]) => basis.length > 0)
    .map(([skill_id, basis]) => ({ skill_id, label: LABEL[skill_id], basis }))
    // Most-evidenced first, then alphabetical — deterministic, and it leads with the
    // strongest claim rather than an accident of iteration order.
    .sort((a, b) => b.basis.length - a.basis.length || a.label.localeCompare(b.label));
}
