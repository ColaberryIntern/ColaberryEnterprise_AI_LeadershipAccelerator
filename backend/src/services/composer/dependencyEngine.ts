/**
 * dependencyEngine — prevents invalid curriculum. Some component types only make
 * sense once their prerequisites are present in the same plan (a Prompt Lab
 * needs the Video that sets it up; a Mock Interview needs the Prompt Lab it
 * interviews on). Pure + deterministic; powers the dependency graph and the
 * pre-publish warnings.
 *
 * NOTE: 'overview' was a prereq of prompt_lab/deep_dive/implementation_task/
 * project_task until the overview type was retired 2026-07-21; those prereqs
 * were dropped so plans without an overview card still validate/publish.
 */
import { PlanCard } from './types';

/** type slug -> the type slugs that should appear earlier in the same plan. */
export const DEP_MAP: Record<string, string[]> = {
  prompt_lab: ['video'],
  prompt_challenge: ['prompt_lab'],
  knowledge_check: ['video'],
  implementation_task: ['prompt_lab'],
  artifact_submission: ['implementation_task'],
  mock_interview: ['prompt_lab'],
  evaluation: ['knowledge_check'],
  certification_exercise: ['evaluation'],
  build_story: ['implementation_task'],
  demo: ['implementation_task'],
  presentation: ['artifact_submission'],
};

export interface DepIssue { type: string; missing: string[] }
export interface DepEdge { from: string; to: string; satisfied: boolean }
export interface DepResult { ok: boolean; issues: DepIssue[]; edges: DepEdge[] }

/**
 * PURE — validate that every card's prerequisites appear earlier in the plan.
 * Order matters: a prereq that appears AFTER the card is not satisfied.
 */
export function checkDependencies(cards: PlanCard[]): DepResult {
  const issues: DepIssue[] = [];
  const edges: DepEdge[] = [];
  const seen = new Set<string>();
  const seenEdge = new Set<string>();

  for (const c of cards) {
    const reqs = DEP_MAP[c.type] || [];
    const missing: string[] = [];
    for (const r of reqs) {
      const satisfied = seen.has(r);
      const key = `${r}->${c.type}`;
      if (!seenEdge.has(key)) { edges.push({ from: r, to: c.type, satisfied }); seenEdge.add(key); }
      if (!satisfied) missing.push(r);
    }
    if (missing.length) issues.push({ type: c.type, missing });
    seen.add(c.type);
  }
  return { ok: issues.length === 0, issues, edges };
}
