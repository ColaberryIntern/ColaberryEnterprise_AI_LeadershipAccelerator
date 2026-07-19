/**
 * learnerContextService — the shared "student 360" the AI Mentor uses to get to
 * know a learner over time. Aggregates persona, competency genome, cross-card
 * assessment history and project readiness into ONE typed LearnerContext that
 * BOTH mentor surfaces (runtime coach + legacy lesson mentor) consume, so the
 * two never drift.
 *
 * Design:
 *  - READ-ONLY sources only. It deliberately avoids projectProgressService
 *    .calculateProgress()/getReadinessScore() because those WRITE cached fields
 *    back onto the Project row — a side effect we must not trigger on every
 *    mentor turn. It reads the cached `requirements_completion_pct` instead.
 *  - RESILIENT. Sources are fetched with Promise.allSettled so one slow/failed
 *    lookup yields a partial context, never a thrown mentor turn.
 *  - COMPACT + SAFE. Serialization (token budget + PII redaction) lives in the
 *    pure learnerContextFormat module.
 */
import { Enrollment } from '../models';
import Cohort from '../models/Cohort';
import UserCurriculumProfile from '../models/UserCurriculumProfile';
import AssessmentAttempt from '../models/AssessmentAttempt';
import LearnerMemory from '../models/LearnerMemory';
import { getSkillGenome } from './skillGenomeService';
import { getProjectByEnrollment } from './projectService';
import {
  LearnerContext, emptyLearnerContext, renderLearnerContext, rollupAssessments,
} from './learnerContextFormat';

export { LearnerContext } from './learnerContextFormat';

/** Top-3 weakest skills (effective level < 3), worst first — derived from the
 *  already-computed genome so we don't recompute it (getSkillGaps would). */
function extractGaps(g: { layers?: Array<{ domains?: Array<{ skills?: Array<{ name: string; effective_level: number }> }> }> }): string[] {
  const gaps: Array<{ name: string; lvl: number }> = [];
  for (const layer of g.layers || []) {
    for (const domain of layer.domains || []) {
      for (const skill of domain.skills || []) {
        if (skill.effective_level < 3) gaps.push({ name: skill.name, lvl: skill.effective_level });
      }
    }
  }
  return gaps.sort((a, b) => a.lvl - b.lvl).slice(0, 3).map((x) => x.name);
}

/** Assemble the typed 360 for a student. Never throws — missing sources are skipped. */
export async function getLearnerContext(enrollmentId: string): Promise<LearnerContext> {
  const ctx = emptyLearnerContext();

  const [enr, profile, genome, project, attempts, memory] = await Promise.allSettled([
    Enrollment.findByPk(enrollmentId),
    UserCurriculumProfile.findOne({ where: { enrollment_id: enrollmentId } }),
    getSkillGenome(enrollmentId),
    getProjectByEnrollment(enrollmentId),
    AssessmentAttempt.findAll({
      where: { enrollment_id: enrollmentId },
      attributes: ['kind', 'score', 'passed', 'competency_scores'],
      order: [['submitted_at', 'DESC']],
      limit: 200,
    }),
    LearnerMemory.findOne({ where: { enrollment_id: enrollmentId }, attributes: ['summary', 'misconceptions', 'strengths'] }),
  ]);

  if (enr.status === 'fulfilled' && enr.value) {
    const e: any = enr.value;
    ctx.identity.full_name = e.full_name ?? null;
    ctx.identity.status = e.status ?? null;
    ctx.identity.readiness = e.readiness_score ?? null;
    if (e.cohort_id) {
      try {
        const c: any = await Cohort.findByPk(e.cohort_id, { attributes: ['name'] });
        if (c) ctx.identity.cohort = c.name ?? null;
      } catch { /* cohort optional */ }
    }
  }

  if (profile.status === 'fulfilled' && profile.value) {
    const p: any = profile.value;
    ctx.persona = {
      company: p.company_name ?? null,
      industry: p.industry ?? null,
      role: p.role ?? null,
      goal: p.goal ?? null,
      ai_maturity: p.ai_maturity_level ?? null,
      use_case: p.identified_use_case ?? null,
    };
  }

  if (genome.status === 'fulfilled' && genome.value) {
    const g = genome.value;
    ctx.competency.proficiency_pct = g.overall_proficiency ?? null;
    ctx.competency.skills_mastered = g.skills_mastered ?? 0;
    ctx.competency.total_skills = g.total_skills ?? 0;
    ctx.competency.top_gaps = extractGaps(g);
  }

  if (project.status === 'fulfilled' && project.value) {
    const pr: any = project.value;
    ctx.project = {
      name: pr.name ?? null,
      stage: pr.project_stage ?? null,
      requirements_pct: pr.requirements_completion_pct ?? null,
    };
  }

  if (attempts.status === 'fulfilled' && Array.isArray(attempts.value)) {
    ctx.assessments = rollupAssessments(attempts.value.map((a: any) => ({
      kind: a.kind, score: a.score, passed: a.passed, competency_scores: a.competency_scores,
    })));
  }

  if (memory.status === 'fulfilled' && memory.value) {
    const m: any = memory.value;
    ctx.memory = { summary: m.summary || '', misconceptions: m.misconceptions || [], strengths: m.strengths || [] };
  }

  return ctx;
}

/**
 * The compact, PII-safe profile block both mentors inject into their system
 * prompt. Fail-safe: returns '' (mentor degrades to no-360) on any error, and
 * logs a structured warning — a 360 failure must never break a mentor turn.
 */
export async function getLearnerContextBlock(enrollmentId: string, budget = 900): Promise<string> {
  try {
    return renderLearnerContext(await getLearnerContext(enrollmentId), budget);
  } catch (e: any) {
    console.warn(JSON.stringify({
      level: 'warn', service: 'learner_context', event: 'assembly_failed',
      enrollment_id: enrollmentId, error_class: e?.name || 'Error', message: String(e?.message || e),
    }));
    return '';
  }
}
