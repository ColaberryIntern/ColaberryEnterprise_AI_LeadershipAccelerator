/**
 * Curriculum Type Registry — the registry pattern that replaces per-type
 * `switch` dispatch. Every card type is one entry here; the engine, feed,
 * scoring, and admin all resolve behavior through `resolve()`.
 *
 * Unknown types FAIL LOUD (`resolveOrThrow`) — never silently skipped, which
 * was the latent bug in the legacy `contentGenerationService` switch.
 *
 * Source spec: docs/architecture/timeline-engine/TYPE_REGISTRY.md.
 * XP/flag values here are SEED DEFAULTS only; the live economy is edited in
 * `points_config` (see pointsConfigService). Nothing here is a hard runtime
 * constant for scoring.
 */
import type { TimelineBucket } from '../../models/TimelineCard';

export type PromptPair = 'concept' | 'build' | 'mentor' | 'kc' | 'reflection';

export interface CardTypeDef {
  slug: string;
  label: string;            // admin-facing
  student_label: string;    // participant-facing
  bucket: TimelineBucket;
  render_band: string;
  learning_xp: number;
  builder_xp: number;
  community_xp: number;
  difficulty: 'intro' | 'core' | 'stretch';
  competencies: string[];   // competency domain ids
  evidence_required: boolean;
  github_required: boolean;
  ai_evaluation: boolean;
  instructor_review: boolean;
  portfolio_eligible: boolean;
  prompt_pairs: PromptPair[];
  /** system types are EMITTED by the engine, never author-scheduled */
  system?: boolean;
  /** event types DELIVER cards; they award no XP themselves */
  event?: boolean;
}

const D = (o: Partial<CardTypeDef> & Pick<CardTypeDef, 'slug' | 'label' | 'student_label' | 'bucket' | 'render_band'>): CardTypeDef => ({
  learning_xp: 0, builder_xp: 0, community_xp: 0,
  difficulty: 'intro', competencies: [],
  evidence_required: false, github_required: false, ai_evaluation: false,
  instructor_review: false, portfolio_eligible: false, prompt_pairs: [],
  ...o,
});

/** The 36 canonical curriculum types (TYPE_REGISTRY.md). */
export const CARD_TYPES: CardTypeDef[] = [
  D({ slug: 'announcement', label: 'Announcement', student_label: 'Announcement', bucket: 'pre_class', render_band: 'announcement' }),
  D({ slug: 'overview', label: 'Overview', student_label: 'Overview', bucket: 'learn', render_band: 'overview', learning_xp: 10, prompt_pairs: ['concept'] }),
  D({ slug: 'live_class', label: 'Live Class', student_label: 'Live Class', bucket: 'learn', render_band: 'live_class', learning_xp: 20, difficulty: 'core', competencies: ['communication'], prompt_pairs: ['concept'] }),
  D({ slug: 'event', label: 'Event', student_label: 'Event', bucket: 'pre_class', render_band: 'event', event: true }),
  D({ slug: 'video', label: 'Video', student_label: 'Video', bucket: 'learn', render_band: 'media', learning_xp: 15 }),
  // Week 0 — free lead-magnet content (the "AI Preview" tier): social proof + light learning.
  D({ slug: 'testimonial', label: 'Testimonial', student_label: 'Testimonial', bucket: 'pre_class', render_band: 'media', learning_xp: 5 }),
  D({ slug: 'podcast', label: 'Podcast', student_label: 'Podcast', bucket: 'learn', render_band: 'media', learning_xp: 10 }),
  D({ slug: 'blog', label: 'Blog', student_label: 'Blog', bucket: 'learn', render_band: 'deepdive', learning_xp: 10 }),
  D({ slug: 'warmup', label: 'Self Study', student_label: 'Self Study', bucket: 'pre_class', render_band: 'warmup', learning_xp: 10 }),
  D({ slug: 'knowledge_check', label: 'Knowledge Check', student_label: 'Knowledge Check', bucket: 'learn', render_band: 'quiz', learning_xp: 15, difficulty: 'core', ai_evaluation: true, prompt_pairs: ['kc'] }),
  D({ slug: 'survey', label: 'Survey', student_label: 'Survey', bucket: 'reflect', render_band: 'survey', learning_xp: 5, community_xp: 5 }),
  D({ slug: 'prompt_lab', label: 'Prompt Lab', student_label: 'Prompt Lab', bucket: 'practice', render_band: 'promptlab', learning_xp: 10, builder_xp: 40, difficulty: 'core', competencies: ['prompt_engineering', 'context_engineering'], evidence_required: true, ai_evaluation: true, portfolio_eligible: true, prompt_pairs: ['concept', 'build', 'mentor'] }),
  D({ slug: 'deep_dive', label: 'Deep Dive', student_label: 'Deep Dive', bucket: 'learn', render_band: 'deepdive', learning_xp: 25, builder_xp: 10, difficulty: 'core', competencies: ['context_engineering'], prompt_pairs: ['concept'] }),
  D({ slug: 'prompt_challenge', label: 'Prompt Challenge', student_label: 'Prompt Challenge', bucket: 'practice', render_band: 'promptlab', learning_xp: 5, builder_xp: 50, difficulty: 'stretch', competencies: ['prompt_engineering'], evidence_required: true, ai_evaluation: true, portfolio_eligible: true, prompt_pairs: ['concept', 'build', 'mentor'] }),
  D({ slug: 'implementation_task', label: 'Implementation Task', student_label: 'Implementation Task', bucket: 'build', render_band: 'task', builder_xp: 80, difficulty: 'core', competencies: ['architecture', 'testing', 'deployment'], evidence_required: true, github_required: true, ai_evaluation: true, instructor_review: true, portfolio_eligible: true, prompt_pairs: ['build', 'mentor'] }),
  D({ slug: 'artifact_submission', label: 'Artifact Submission', student_label: 'Artifact Submission', bucket: 'build', render_band: 'artifact', builder_xp: 60, difficulty: 'core', competencies: ['documentation', 'architecture'], evidence_required: true, github_required: true, instructor_review: true, portfolio_eligible: true, prompt_pairs: ['mentor'] }),
  D({ slug: 'ai_video_feedback', label: 'AI Video Feedback', student_label: 'AI Video Feedback', bucket: 'reflect', render_band: 'video_feedback', learning_xp: 5, builder_xp: 30, difficulty: 'core', competencies: ['communication'], evidence_required: true, ai_evaluation: true, portfolio_eligible: true, prompt_pairs: ['reflection'] }),
  D({ slug: 'mock_interview', label: 'Mock Interview', student_label: 'Mock Interview', bucket: 'advance', render_band: 'interview', builder_xp: 60, difficulty: 'stretch', competencies: ['communication', 'leadership'], evidence_required: true, ai_evaluation: true, instructor_review: true, portfolio_eligible: true, prompt_pairs: ['mentor'] }),
  D({ slug: 'anthropic_skills_jar', label: 'Anthropic Skills Course', student_label: 'Anthropic Skills Course', bucket: 'learn', render_band: 'skills_jar', learning_xp: 25, difficulty: 'core', competencies: ['prompt_engineering'] }),
  D({ slug: 'certification_exercise', label: 'Certification Exercise', student_label: 'Certification Exercise', bucket: 'advance', render_band: 'exam', builder_xp: 70, difficulty: 'stretch', competencies: ['architecture', 'prompt_engineering'], evidence_required: true, ai_evaluation: true, instructor_review: true, portfolio_eligible: true, prompt_pairs: ['build'] }),
  D({ slug: 'evaluation', label: 'Evaluation', student_label: 'Evaluation', bucket: 'advance', render_band: 'evaluation', builder_xp: 50, difficulty: 'core', competencies: ['architecture'], evidence_required: true, ai_evaluation: true, instructor_review: true, prompt_pairs: ['mentor'] }),
  D({ slug: 'question', label: 'Question', student_label: 'Question', bucket: 'learn', render_band: 'question', learning_xp: 5, community_xp: 5 }),
  D({ slug: 'discussion', label: 'Discussion', student_label: 'Discussion', bucket: 'share', render_band: 'discussion', community_xp: 15, competencies: ['communication'] }),
  D({ slug: 'project_task', label: 'Project Task', student_label: 'Project Task', bucket: 'build', render_band: 'task', builder_xp: 80, difficulty: 'core', competencies: ['architecture', 'testing'], evidence_required: true, github_required: true, ai_evaluation: true, instructor_review: true, portfolio_eligible: true, prompt_pairs: ['build', 'mentor'] }),
  D({ slug: 'build_story', label: 'Build Story', student_label: 'Build Story', bucket: 'share', render_band: 'build_story', builder_xp: 40, community_xp: 10, difficulty: 'core', competencies: ['communication', 'documentation'], evidence_required: true, ai_evaluation: true, portfolio_eligible: true, prompt_pairs: ['mentor'] }),
  D({ slug: 'github_sync', label: 'GitHub Sync', student_label: 'GitHub Sync', bucket: 'build', render_band: 'github', builder_xp: 30, difficulty: 'core', competencies: ['github', 'deployment'], evidence_required: true, github_required: true, portfolio_eligible: true }),
  D({ slug: 'reflection', label: 'Reflection', student_label: 'Reflection', bucket: 'reflect', render_band: 'reflection', learning_xp: 15, builder_xp: 5, competencies: ['leadership'], ai_evaluation: true, prompt_pairs: ['reflection'] }),
  D({ slug: 'community_discussion', label: 'Community Discussion', student_label: 'Community Discussion', bucket: 'share', render_band: 'community', community_xp: 20, competencies: ['communication'] }),
  D({ slug: 'presentation', label: 'Presentation', student_label: 'Presentation', bucket: 'share', render_band: 'presentation', builder_xp: 60, community_xp: 10, difficulty: 'stretch', competencies: ['communication', 'leadership'], evidence_required: true, ai_evaluation: true, instructor_review: true, portfolio_eligible: true, prompt_pairs: ['mentor'] }),
  D({ slug: 'study_session', label: 'Study Session', student_label: 'Study Session', bucket: 'practice', render_band: 'study', learning_xp: 10, community_xp: 5 }),
  D({ slug: 'demo', label: 'Demo', student_label: 'Demo', bucket: 'share', render_band: 'demo', builder_xp: 40, community_xp: 10, difficulty: 'core', competencies: ['communication'], evidence_required: true, portfolio_eligible: true, prompt_pairs: ['mentor'] }),
  D({ slug: 'internship_activity', label: 'Internship Activity', student_label: 'Internship Activity', bucket: 'advance', render_band: 'task', builder_xp: 70, difficulty: 'stretch', competencies: ['architecture', 'deployment'], evidence_required: true, github_required: true, instructor_review: true, portfolio_eligible: true, prompt_pairs: ['build', 'mentor'] }),
  D({ slug: 'demo_tuesday', label: 'Demo Tuesday', student_label: 'Demo Tuesday', bucket: 'share', render_band: 'event', event: true }),
  D({ slug: 'kes_wednesday', label: 'Kes Wednesday', student_label: 'Kes Wednesday', bucket: 'learn', render_band: 'event', event: true }),
  D({ slug: 'marketing_friday', label: 'Marketing Friday', student_label: 'Marketing Friday', bucket: 'share', render_band: 'event', event: true }),
  D({ slug: 'milestone', label: 'Milestone', student_label: 'Milestone', bucket: 'advance', render_band: 'milestone', system: true }),
  D({ slug: 'achievement', label: 'Achievement', student_label: 'Achievement', bucket: 'advance', render_band: 'achievement', system: true }),
  D({ slug: 'daily_streak', label: 'Daily Streak', student_label: 'Daily Streak', bucket: 'advance', render_band: 'streak', system: true }),
  D({ slug: 'completion_badge', label: 'Completion Badge', student_label: 'Completion Badge', bucket: 'advance', render_band: 'badge', system: true }),
];

const REGISTRY = new Map<string, CardTypeDef>(CARD_TYPES.map((t) => [t.slug, t]));

/** Register/override a type at runtime (extension point). */
export function register(def: CardTypeDef): void {
  REGISTRY.set(def.slug, def);
}

export function resolve(slug: string): CardTypeDef | undefined {
  return REGISTRY.get(slug);
}

/** Fail-loud resolver — unknown types throw rather than silently skip. */
export function resolveOrThrow(slug: string): CardTypeDef {
  const def = REGISTRY.get(slug);
  if (!def) {
    throw new Error(`[typeRegistry] unknown card type "${slug}" — register it before use`);
  }
  return def;
}

export function allTypes(): CardTypeDef[] {
  return Array.from(REGISTRY.values());
}

/**
 * LEGACY_TYPE_MAP — maps legacy mini_section_type / lesson_type onto the new
 * taxonomy so backfill never orphans a card (MIGRATION_PLAN.md §2). Unknown
 * legacy types map to 'overview' with a logged breadcrumb.
 */
export const LEGACY_TYPE_MAP: Record<string, string> = {
  executive_reality_check: 'overview',
  ai_strategy: 'deep_dive',
  prompt_template: 'prompt_lab',
  implementation_task: 'implementation_task',
  knowledge_check: 'knowledge_check',
  concept: 'overview',
  lab: 'prompt_lab',
  assessment: 'evaluation',
  reflection: 'reflection',
  section: 'overview',
};

export function mapLegacyType(legacy: string | null | undefined): { slug: string; fallback: boolean } {
  if (legacy && LEGACY_TYPE_MAP[legacy]) return { slug: LEGACY_TYPE_MAP[legacy], fallback: false };
  return { slug: 'overview', fallback: true };
}
