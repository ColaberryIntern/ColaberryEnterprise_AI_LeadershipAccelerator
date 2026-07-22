/**
 * blueprintService — orchestrates the Curriculum Composer around the Blueprint
 * (the source of truth): CRUD, AI generation of a plan, and the full assessment
 * (validation + evidence + DNA + journey + recommendations). Nothing here talks
 * to the Timeline — publishing lives in publishService.
 */
import CurriculumBlueprint from '../../models/CurriculumBlueprint';
import { CurriculumPlan, ComposerScope, PlanCard } from './types';
import { generateCurriculum, scaffoldPlan, BlueprintInput } from './composerAi';
import { coverageGaps } from './coverageGapEngine';
import { curateVideosForGaps, curateTopicPack, curatedVideoToCard } from './videoCurationService';
import { validateCurriculum, BlueprintLike } from './validationEngine';
import { estimateEvidence } from './evidenceEngine';
import { deriveDna } from './curriculumDna';
import { journeyContribution } from './architectJourney';
import { recommend } from './optimizationEngine';
import { checkDependencies } from './dependencyEngine';
import { planMinutes, minutesToHours } from './blueprintRollup';

function blueprintLike(bp: CurriculumBlueprint): BlueprintLike & BlueprintInput {
  return {
    title: bp.title, purpose: bp.purpose ?? undefined, week: bp.week,
    difficulty: bp.difficulty, competencies: arr(bp.competencies), architect_domains: arr(bp.architect_domains),
    session_competencies: arr(bp.session_competencies),
    learning_objectives: arr(bp.learning_objectives), estimated_hours: bp.estimated_hours ?? undefined,
  };
}
const arr = (v: any): string[] => (Array.isArray(v) ? v : []);

/** PURE-ish — assemble the full assessment of a plan against its blueprint. */
export function assessPlan(bp: CurriculumBlueprint, plan: CurriculumPlan, aiConfidence = 0.85) {
  const cards = plan.cards || [];
  const bl = blueprintLike(bp);
  const validation = validateCurriculum(cards, bl);
  const evidence = estimateEvidence(cards);
  const journey = journeyContribution(cards, bl.session_competencies);
  const dna = deriveDna({ ...bl, purpose: bp.purpose ?? undefined, title: bp.title }, cards, validation, aiConfidence);
  const recommendations = recommend(cards, bl, validation);
  const dependencies = checkDependencies(cards);
  return { validation, evidence, journey, dna, recommendations, dependencies };
}

export async function listBlueprints(programId?: string | null) {
  // Scoped to a course (program) when provided — the Composer works one course at
  // a time. Ordered by week so the dropdown reads Wk 1 -> Wk N.
  const where: Record<string, any> = {};
  if (programId) where.program_id = programId;
  const rows = await CurriculumBlueprint.findAll({ where, order: [['week', 'ASC'], ['updated_at', 'DESC']] });
  return rows.map((r) => r.toJSON());
}

export async function getBlueprint(id: string) {
  const bp = await CurriculumBlueprint.findByPk(id);
  if (!bp) throw Object.assign(new Error('Blueprint not found'), { status: 404 });
  const plan: CurriculumPlan | null = bp.generated_plan || null;
  const assessment = plan ? assessPlan(bp, plan) : null;
  return { ...bp.toJSON(), assessment };
}

const CREATE_FIELDS = [
  'title', 'purpose', 'problem_statement', 'target_audience', 'program_id', 'cohort_id', 'week', 'session',
  'scope', 'difficulty', 'estimated_hours', 'learning_objectives', 'competencies', 'architect_domains', 'session_competencies', 'bloom',
  'evidence_produced', 'github_deliverables', 'portfolio_deliverables', 'builder_xp', 'learning_xp', 'community_xp',
  'architect_readiness', 'certification_mapping', 'unlock_rules', 'completion_rules', 'success_criteria',
  'instructor_notes', 'ai_notes', 'risk_areas', 'student_outcomes',
] as const;

export async function createBlueprint(input: Record<string, any>) {
  const clean: Record<string, any> = {};
  for (const f of CREATE_FIELDS) if (f in input) clean[f] = input[f];
  if (!clean.title) clean.title = 'Untitled curriculum';
  clean.status = 'draft';
  const bp = await CurriculumBlueprint.create(clean as any);
  return bp.toJSON();
}

export async function updateBlueprint(id: string, patch: Record<string, any>) {
  const bp = await CurriculumBlueprint.findByPk(id);
  if (!bp) throw Object.assign(new Error('Blueprint not found'), { status: 404 });
  const clean: Record<string, any> = {};
  for (const f of CREATE_FIELDS) if (f in patch) clean[f] = patch[f];
  await bp.update(clean);
  return bp.toJSON();
}

export async function deleteBlueprint(id: string) {
  const bp = await CurriculumBlueprint.findByPk(id);
  if (!bp) throw Object.assign(new Error('Blueprint not found'), { status: 404 });
  await bp.destroy();
  return { deleted: true };
}

/** Generate a plan from the blueprint + an instruction, persist it, and return the full assessment. */
export async function generateForBlueprint(id: string, instruction: string, scope?: ComposerScope, model?: string) {
  const bp = await CurriculumBlueprint.findByPk(id);
  if (!bp) throw Object.assign(new Error('Blueprint not found'), { status: 404 });
  const useScope = (scope || bp.scope || 'week') as ComposerScope;
  const result = await generateCurriculum(blueprintLike(bp), instruction || `Generate ${useScope} for ${bp.title}`, useScope, model);
  const assessment = assessPlan(bp, result.plan, result.ai_confidence);
  await bp.update({
    generated_plan: result.plan, dna: assessment.dna, status: 'generated',
    quality_score: assessment.validation.quality, coverage_score: assessment.validation.coverage, readiness_score: assessment.validation.readiness,
    // estimated_hours is a live rollup — seed it from the freshly generated plan
    // (publish later recomputes it from the real published cards).
    estimated_hours: minutesToHours(planMinutes(result.plan)),
  });
  return { plan: result.plan, source: result.source, cost_usd: result.cost_usd ?? 0, runtime_ms: result.runtime_ms ?? 0, assessment };
}

/** Re-run assessment on the stored plan (validate endpoint). */
export async function validateBlueprint(id: string) {
  const bp = await CurriculumBlueprint.findByPk(id);
  if (!bp) throw Object.assign(new Error('Blueprint not found'), { status: 404 });
  const plan: CurriculumPlan = bp.generated_plan || scaffoldPlan(blueprintLike(bp), (bp.scope || 'week') as ComposerScope);
  const assessment = assessPlan(bp, plan);
  if (assessment.validation.publishable && bp.status === 'generated') await bp.update({ status: 'validated' });
  return { plan, assessment };
}

/**
 * Curate short YouTube videos to fill this blueprint's competency gaps.
 * READ-ONLY — no mutation. Returns the gaps, the raw curation result, and the
 * candidate video cards for the operator to approve. External call is contained
 * in videoCurationService (fail-soft: no key / no results ⇒ empty + notes).
 */
export async function curateVideoFill(id: string, opts: { budgetMinutes?: number } = {}) {
  const bp = await CurriculumBlueprint.findByPk(id);
  if (!bp) throw Object.assign(new Error('Blueprint not found'), { status: 404 });
  const bl = blueprintLike(bp);
  const plan: CurriculumPlan = bp.generated_plan || scaffoldPlan(bl, (bp.scope || 'week') as ComposerScope);
  const gaps = coverageGaps(bl, plan.cards || []);
  const curation = await curateVideosForGaps(gaps, { topic: bp.title, budgetMinutes: opts.budgetMinutes });
  const cards = curation.videos.map((v) => curatedVideoToCard(v, bp.week));
  return { gaps, curation, cards };
}

/** Default "latest in AI" themes for a Week-0 style topic pack. */
export const AI_NEWS_THEMES = [
  'latest AI news 2026', 'new AI tools 2026', 'AI breakthroughs 2026',
  'generative AI update 2026', 'Claude AI new features', 'AI agents explained 2026',
  'large language model news 2026', 'AI for business 2026', 'AI coding assistant 2026',
  'model context protocol MCP explained', 'prompt engineering explained', 'AI research explained 2026',
];

/**
 * Themed video pack for a week (e.g. Week 0's "latest in AI"). READ-ONLY preview —
 * no mutation. Returns the raw pack + candidate cards (each tagged ai_literacy so
 * they still count toward coverage). Not gap-based.
 */
export async function curateTopicPackFill(id: string, opts: { count?: number; themes?: string[]; budgetMinutes?: number } = {}) {
  const bp = await CurriculumBlueprint.findByPk(id);
  if (!bp) throw Object.assign(new Error('Blueprint not found'), { status: 404 });
  const themes = (opts.themes && opts.themes.length) ? opts.themes : AI_NEWS_THEMES;
  const pack = await curateTopicPack(themes, 'ai_literacy', 'Latest in AI', { count: opts.count ?? 35, budgetMinutes: opts.budgetMinutes });
  const cards = pack.videos.map((v) => curatedVideoToCard(v, bp.week));
  return { pack, cards };
}

export interface ApprovedVideo { video_url: string; title: string; channel?: string; duration_seconds: number; competency: string; competency_label?: string }

/**
 * NON-DESTRUCTIVE apply: append the operator-approved video cards to the plan and
 * re-assess. NO LLM regeneration (unlike the recommendation "Apply" that used to
 * regenerate the whole week). Idempotent — a video already in the plan (by URL)
 * is skipped, so re-applying is a no-op end state.
 */
export async function applyVideoFill(id: string, approved: ApprovedVideo[]) {
  const bp = await CurriculumBlueprint.findByPk(id);
  if (!bp) throw Object.assign(new Error('Blueprint not found'), { status: 404 });
  const plan: CurriculumPlan = bp.generated_plan || scaffoldPlan(blueprintLike(bp), (bp.scope || 'week') as ComposerScope);
  const existing = new Set((plan.cards || []).map((c) => (c.video_url || '').trim()).filter(Boolean));
  const toAdd: PlanCard[] = (approved || [])
    .filter((v) => v.video_url && !existing.has(v.video_url.trim()))
    .map((v) => curatedVideoToCard(
      { video_id: '', title: v.title, channel: v.channel || '', url: v.video_url,
        duration_seconds: v.duration_seconds, duration_label: '', thumbnail_url: null, view_count: 0,
        competency: v.competency, competency_label: v.competency_label || v.competency },
      bp.week,
    ));
  const nextPlan: CurriculumPlan = { ...plan, cards: [...(plan.cards || []), ...toAdd] };
  const assessment = assessPlan(bp, nextPlan);
  await bp.update({
    generated_plan: nextPlan, dna: assessment.dna,
    status: bp.status === 'published' ? 'published' : 'generated',
    quality_score: assessment.validation.quality, coverage_score: assessment.validation.coverage, readiness_score: assessment.validation.readiness,
    estimated_hours: minutesToHours(planMinutes(nextPlan)),
  });
  return { plan: nextPlan, assessment, added: toAdd.length };
}
