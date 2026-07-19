/**
 * learnerContextFormat — the PURE half of the Learner Context Service. No I/O and
 * no model imports, so it is unit-testable in isolation and owns the two cross-
 * cutting rules for a mentor that reads a student's whole record:
 *   1. Token budget — the always-on block is capped so it is cheap to inject on
 *      every mentor turn.
 *   2. PII redaction — emails and phone numbers are stripped from the rendered
 *      block (persona free-text like "goal" / "use case" can carry them), so raw
 *      PII never reaches the LLM prompt.
 *
 * This is the shared 360 both mentor surfaces (runtime coach + legacy lesson
 * mentor) render, so a student's persona, competency, assessment history and
 * project readiness are described one way, in one place.
 */
import { renderMemoryLine, DistilledMemory } from './runtime/learnerMemoryFormat';

export interface LearnerIdentity { full_name: string | null; status: string | null; cohort: string | null; readiness: number | null; }
export interface LearnerPersona { company?: string | null; industry?: string | null; role?: string | null; goal?: string | null; ai_maturity?: number | null; use_case?: string | null; }
export interface LearnerCompetency { proficiency_pct: number | null; skills_mastered: number; total_skills: number; top_gaps: string[]; }
export interface LearnerAssessments { evals_taken: number; evals_passed: number; avg_eval_pct: number | null; weak_competencies: string[]; }
export interface LearnerProject { name: string | null; stage: string | null; requirements_pct: number | null; }

export interface LearnerContext {
  identity: LearnerIdentity;
  persona: LearnerPersona;
  competency: LearnerCompetency;
  assessments: LearnerAssessments;
  project: LearnerProject | null;
  memory?: Partial<DistilledMemory> | null; // the evolving profile (Phase 3), null if not distilled yet
}

const clip = (s: string, n = 120) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const pretty = (s: string) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** PURE — strip emails and phone numbers from any text bound for the prompt. */
export function redactPII(s: string): string {
  return (s || '')
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[redacted-email]')
    // phone: optional +country, optional (area), then 3-3-4 with any separators
    .replace(/\+?\d{0,3}[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, '[redacted-phone]');
}

/** An empty typed context — the safe default when a source is unavailable. */
export function emptyLearnerContext(): LearnerContext {
  return {
    identity: { full_name: null, status: null, cohort: null, readiness: null },
    persona: {},
    competency: { proficiency_pct: null, skills_mastered: 0, total_skills: 0, top_gaps: [] },
    assessments: { evals_taken: 0, evals_passed: 0, avg_eval_pct: null, weak_competencies: [] },
    project: null,
    memory: null,
  };
}

/**
 * PURE — render a compact, PII-safe "student profile" block for the system prompt.
 * Only sections with real data appear; the whole block is budget-capped and
 * redacted. Returns '' when nothing is known yet (a brand-new enrollment).
 */
export function renderLearnerContext(ctx: LearnerContext, budget = 900): string {
  const lines: string[] = [];

  // identity
  const id = ctx.identity;
  if (id.full_name || id.cohort || id.status || id.readiness != null) {
    const bits = [id.full_name].filter(Boolean) as string[];
    if (id.cohort) bits.push(`cohort "${clip(id.cohort, 40)}"`);
    if (id.status) bits.push(String(id.status));
    if (id.readiness != null) bits.push(`readiness ${Math.round(id.readiness)}/100`);
    if (bits.length) lines.push(`- ${bits.join(', ')}.`);
  }

  // persona
  const p = ctx.persona;
  const persona: string[] = [];
  if (p.company) persona.push(clip(p.company, 40));
  if (p.industry) persona.push(clip(p.industry, 40));
  if (p.role) persona.push(clip(p.role, 40));
  if (p.goal) persona.push(`goal "${clip(p.goal, 80)}"`);
  if (p.ai_maturity != null) persona.push(`AI maturity ${p.ai_maturity}/5`);
  if (p.use_case) persona.push(`use case "${clip(p.use_case, 80)}"`);
  if (persona.length) lines.push(`- Persona: ${persona.join('; ')}.`);

  // competency
  const c = ctx.competency;
  if (c.proficiency_pct != null || c.total_skills > 0 || c.top_gaps.length) {
    const seg: string[] = [];
    if (c.proficiency_pct != null) seg.push(`${Math.round(c.proficiency_pct)}% overall proficiency`);
    if (c.total_skills > 0) seg.push(`${c.skills_mastered}/${c.total_skills} skills mastered`);
    let line = `- Competency: ${seg.join(', ')}`;
    if (c.top_gaps.length) line += `. Weakest: ${c.top_gaps.slice(0, 3).map(pretty).join(', ')}`;
    lines.push(line + '.');
  }

  // assessments
  const a = ctx.assessments;
  if (a.evals_taken > 0) {
    let line = `- Assessments: ${a.evals_taken} evaluation${a.evals_taken === 1 ? '' : 's'} taken, ${a.evals_passed} passed`;
    if (a.avg_eval_pct != null) line += ` (avg ${Math.round(a.avg_eval_pct)}%)`;
    if (a.weak_competencies.length) line += `. Weak areas: ${a.weak_competencies.slice(0, 3).map(pretty).join(', ')}`;
    lines.push(line + '.');
  }

  // project
  const pr = ctx.project;
  if (pr && (pr.name || pr.stage || pr.requirements_pct != null)) {
    const seg: string[] = [];
    if (pr.name) seg.push(`"${clip(pr.name, 60)}"`);
    if (pr.stage) seg.push(`stage: ${pretty(pr.stage)}`);
    if (pr.requirements_pct != null) seg.push(`requirements ${Math.round(pr.requirements_pct)}% complete`);
    lines.push(`- Project ${seg.join(', ')}.`);
  }

  // longitudinal memory (Phase 3) — what the mentor has learned over weeks
  const memLine = renderMemoryLine(ctx.memory);
  if (memLine) lines.push(`- ${memLine}`);

  if (!lines.length) return '';
  const header = 'STUDENT PROFILE (what you know about this learner so far — personalize with it; never use it to do their graded work):';
  return redactPII(`${header}\n${lines.join('\n')}`).slice(0, budget);
}

/**
 * PURE — roll a set of evaluation attempts into the assessment headline: counts,
 * average score, and the weakest competencies aggregated across attempts.
 */
export function rollupAssessments(
  attempts: Array<{ kind: string; score: number; passed: boolean | null; competency_scores?: Record<string, { correct: number; total: number }> | null }>,
): LearnerAssessments {
  const evals = attempts.filter((x) => x.kind === 'evaluation');
  const evals_taken = evals.length;
  const evals_passed = evals.filter((x) => x.passed === true).length;
  const avg_eval_pct = evals_taken ? (evals.reduce((s, x) => s + (x.score || 0), 0) / evals_taken) * 100 : null;

  const agg: Record<string, { correct: number; total: number }> = {};
  for (const x of attempts) {
    const cs = x.competency_scores || {};
    for (const [k, v] of Object.entries(cs)) {
      (agg[k] = agg[k] || { correct: 0, total: 0 });
      agg[k].correct += v.correct || 0;
      agg[k].total += v.total || 0;
    }
  }
  const weak_competencies = Object.entries(agg)
    .filter(([, v]) => v.total > 0)
    .map(([k, v]) => ({ k, pct: v.correct / v.total }))
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 3)
    .map((x) => x.k);

  return { evals_taken, evals_passed, avg_eval_pct, weak_competencies };
}
