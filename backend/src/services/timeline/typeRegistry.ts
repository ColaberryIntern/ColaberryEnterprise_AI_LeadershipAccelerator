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
 *
 * ── Surface dimension (Today Timeline v2, Phase 0) ──────────────────────────
 * Every type carries a SECOND axis beyond `type` ("what it is"):
 *   • home_surface  — WHERE the card belongs: today | class | project |
 *                     community | group. See ./surfaces.ts for labels + colors.
 *   • feed_mode     — 'anchored' (has a home + fixed position there; may also
 *                     mirror INTO Today) or 'ambient' (no home but Today;
 *                     rotated/deduped/alternated for engagement — blog, podcast,
 *                     testimonial, plus engine-emitted system gamification).
 *   • today_eligible— may this card appear in the aggregated Today feed?
 * The one-way valve: Today aggregates everything eligible; anchored surfaces
 * (class/project/community/group) render ONLY their own cards — never ambient,
 * never each other's. Ambient (home_surface='today') is Today-ONLY.
 *
 * Phase 0 is metadata only — NOTHING consumes feed_mode/home_surface for feed
 * composition yet (the composer lands in Phase 1). Defaults below:
 *   home_surface='class', feed_mode='anchored', today_eligible=true.
 * Lines tagged ⚑ are reversible product judgment-calls flagged for review.
 */
import type { TimelineBucket } from '../../models/TimelineCard';

export type PromptPair = 'concept' | 'build' | 'mentor' | 'kc' | 'reflection';

/** The card's canonical home surface — the placement axis. See ./surfaces.ts. */
export type SurfaceId = 'today' | 'class' | 'project' | 'community' | 'group';

/** anchored = fixed home + position; ambient = Today-only, rotated for engagement. */
export type FeedMode = 'anchored' | 'ambient';

export interface CardTypeDef {
  slug: string;
  label: string;            // admin-facing
  student_label: string;    // participant-facing
  bucket: TimelineBucket;
  render_band: string;
  est_minutes: number;      // default duration (minutes) for an item of this type
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
  /** Placement axis — where this card lives (Today Timeline v2). */
  home_surface: SurfaceId;
  /** anchored (homed, mirrorable to Today) vs ambient (Today-only, rotated). */
  feed_mode: FeedMode;
  /** May this card appear in the aggregated Today feed? */
  today_eligible: boolean;
  /** system types are EMITTED by the engine, never author-scheduled */
  system?: boolean;
  /** event types DELIVER cards; they award no XP themselves */
  event?: boolean;
}

const D = (o: Partial<CardTypeDef> & Pick<CardTypeDef, 'slug' | 'label' | 'student_label' | 'bucket' | 'render_band'>): CardTypeDef => ({
  est_minutes: 10,
  learning_xp: 0, builder_xp: 0, community_xp: 0,
  difficulty: 'intro', competencies: [],
  evidence_required: false, github_required: false, ai_evaluation: false,
  instructor_review: false, portfolio_eligible: false, prompt_pairs: [],
  // Surface defaults — curriculum-tied class activity that also flows into Today.
  home_surface: 'class', feed_mode: 'anchored', today_eligible: true,
  ...o,
});

/** The 36 canonical curriculum types (TYPE_REGISTRY.md). */
export const CARD_TYPES: CardTypeDef[] = [
  D({ slug: 'announcement', label: 'Announcement', student_label: 'Announcement', bucket: 'pre_class', render_band: 'announcement', est_minutes: 2, home_surface: 'today' }), // ⚑ broadcast — homed to Today, still anchored (one-shot, not rotated)
  D({ slug: 'overview', label: 'Overview', student_label: 'Overview', bucket: 'learn', render_band: 'overview', est_minutes: 8, learning_xp: 10, prompt_pairs: ['concept'] }),
  D({ slug: 'live_class', label: 'Live Class', student_label: 'Live Class', bucket: 'learn', render_band: 'live_class', est_minutes: 120, learning_xp: 20, difficulty: 'core', competencies: ['communication'], prompt_pairs: ['concept'], home_surface: 'group' }), // live event → group
  D({ slug: 'event', label: 'Event', student_label: 'Event', bucket: 'pre_class', render_band: 'event', est_minutes: 60, event: true, home_surface: 'group' }),
  D({ slug: 'video', label: 'Video', student_label: 'Video', bucket: 'learn', render_band: 'media', est_minutes: 12, learning_xp: 15 }), // ⚑ rotates via networkVideoService — candidate for feed_mode:'ambient'; kept anchored/class in Phase 0
  // Week 0 — free lead-magnet content (the "AI Preview" tier): social proof + light learning.
  D({ slug: 'testimonial', label: 'Testimonial', student_label: 'Testimonial', bucket: 'pre_class', render_band: 'media', est_minutes: 3, learning_xp: 5, home_surface: 'today', feed_mode: 'ambient' }),
  D({ slug: 'podcast', label: 'Podcast', student_label: 'Podcast', bucket: 'learn', render_band: 'media', est_minutes: 18, learning_xp: 10, home_surface: 'today', feed_mode: 'ambient' }),
  D({ slug: 'blog', label: 'Blog', student_label: 'Blog', bucket: 'learn', render_band: 'deepdive', est_minutes: 5, learning_xp: 10, home_surface: 'today', feed_mode: 'ambient' }),
  D({ slug: 'warmup', label: 'Self Study', student_label: 'Self Study', bucket: 'pre_class', render_band: 'warmup', est_minutes: 15, learning_xp: 10 }),
  D({ slug: 'knowledge_check', label: 'Knowledge Check', student_label: 'Knowledge Check', bucket: 'learn', render_band: 'quiz', est_minutes: 10, learning_xp: 15, difficulty: 'core', ai_evaluation: true, prompt_pairs: ['kc'] }),
  D({ slug: 'survey', label: 'Survey', student_label: 'Survey', bucket: 'reflect', render_band: 'survey', est_minutes: 5, learning_xp: 5, community_xp: 5 }),
  D({ slug: 'prompt_lab', label: 'Prompt Lab', student_label: 'Prompt Lab', bucket: 'practice', render_band: 'promptlab', est_minutes: 45, learning_xp: 10, builder_xp: 40, difficulty: 'core', competencies: ['prompt_engineering', 'context_engineering'], evidence_required: true, ai_evaluation: true, portfolio_eligible: true, prompt_pairs: ['concept', 'build', 'mentor'] }),
  D({ slug: 'deep_dive', label: 'Deep Dive', student_label: 'Deep Dive', bucket: 'learn', render_band: 'deepdive', est_minutes: 20, learning_xp: 25, builder_xp: 10, difficulty: 'core', competencies: ['context_engineering'], prompt_pairs: ['concept'] }),
  D({ slug: 'prompt_challenge', label: 'Prompt Challenge', student_label: 'Prompt Challenge', bucket: 'practice', render_band: 'promptlab', est_minutes: 45, learning_xp: 5, builder_xp: 50, difficulty: 'stretch', competencies: ['prompt_engineering'], evidence_required: true, ai_evaluation: true, portfolio_eligible: true, prompt_pairs: ['concept', 'build', 'mentor'] }),
  D({ slug: 'implementation_task', label: 'Implementation Task', student_label: 'Implementation Task', bucket: 'build', render_band: 'task', est_minutes: 90, builder_xp: 80, difficulty: 'core', competencies: ['architecture', 'testing', 'deployment'], evidence_required: true, github_required: true, ai_evaluation: true, instructor_review: true, portfolio_eligible: true, prompt_pairs: ['build', 'mentor'], home_surface: 'project' }),
  D({ slug: 'setup_lab', label: 'Setup Lab', student_label: 'Setup Lab', bucket: 'build', render_band: 'setup_lab', est_minutes: 30, learning_xp: 20, builder_xp: 100, difficulty: 'intro', competencies: ['claude_code'], evidence_required: true, prompt_pairs: [] }),   // Claude Code "get unblocked" enablement lab (dark bespoke renderer)
  D({ slug: 'artifact_submission', label: 'Artifact Submission', student_label: 'Artifact Submission', bucket: 'build', render_band: 'artifact', est_minutes: 60, builder_xp: 60, difficulty: 'core', competencies: ['documentation', 'architecture'], evidence_required: true, github_required: true, instructor_review: true, portfolio_eligible: true, prompt_pairs: ['mentor'], home_surface: 'project' }),
  D({ slug: 'ai_video_feedback', label: 'AI Video Feedback', student_label: 'AI Video Feedback', bucket: 'reflect', render_band: 'video_feedback', est_minutes: 15, learning_xp: 5, builder_xp: 30, difficulty: 'core', competencies: ['communication'], evidence_required: true, ai_evaluation: true, portfolio_eligible: true, prompt_pairs: ['reflection'] }),
  D({ slug: 'mock_interview', label: 'Mock Interview', student_label: 'Mock Interview', bucket: 'advance', render_band: 'interview', est_minutes: 45, builder_xp: 60, difficulty: 'stretch', competencies: ['communication', 'leadership'], evidence_required: true, ai_evaluation: true, instructor_review: true, portfolio_eligible: true, prompt_pairs: ['mentor'] }),
  D({ slug: 'anthropic_skills_jar', label: 'Anthropic Skills Course', student_label: 'Anthropic Skills Course', bucket: 'learn', render_band: 'skills_jar', est_minutes: 60, learning_xp: 25, difficulty: 'core', competencies: ['prompt_engineering'] }),
  D({ slug: 'certification_exercise', label: 'Certification Exercise', student_label: 'Certification Exercise', bucket: 'advance', render_band: 'exam', est_minutes: 60, builder_xp: 70, difficulty: 'stretch', competencies: ['architecture', 'prompt_engineering'], evidence_required: true, ai_evaluation: true, instructor_review: true, portfolio_eligible: true, prompt_pairs: ['build'] }),
  D({ slug: 'evaluation', label: 'Evaluation', student_label: 'Evaluation', bucket: 'advance', render_band: 'evaluation', est_minutes: 30, builder_xp: 50, difficulty: 'core', competencies: ['architecture'], evidence_required: true, ai_evaluation: true, instructor_review: true, prompt_pairs: ['mentor'] }),
  D({ slug: 'question', label: 'Question', student_label: 'Question', bucket: 'learn', render_band: 'question', est_minutes: 5, learning_xp: 5, community_xp: 5 }), // ⚑ learn-bucket Q&A kept in class; could be community
  D({ slug: 'discussion', label: 'Discussion', student_label: 'Discussion', bucket: 'share', render_band: 'discussion', est_minutes: 15, community_xp: 15, competencies: ['communication'], home_surface: 'community' }),
  D({ slug: 'project_task', label: 'Project Task', student_label: 'Project Task', bucket: 'build', render_band: 'task', est_minutes: 90, builder_xp: 80, difficulty: 'core', competencies: ['architecture', 'testing'], evidence_required: true, github_required: true, ai_evaluation: true, instructor_review: true, portfolio_eligible: true, prompt_pairs: ['build', 'mentor'], home_surface: 'project' }),
  D({ slug: 'build_story', label: 'Build Story', student_label: 'Build Story', bucket: 'share', render_band: 'build_story', est_minutes: 30, builder_xp: 40, community_xp: 10, difficulty: 'core', competencies: ['communication', 'documentation'], evidence_required: true, ai_evaluation: true, portfolio_eligible: true, prompt_pairs: ['mentor'], home_surface: 'project' }), // ⚑ tied to the project build; share-bucket, could be community
  D({ slug: 'github_sync', label: 'GitHub Sync', student_label: 'GitHub Sync', bucket: 'build', render_band: 'github', est_minutes: 15, builder_xp: 30, difficulty: 'core', competencies: ['github', 'deployment'], evidence_required: true, github_required: true, portfolio_eligible: true, home_surface: 'project', today_eligible: false }), // plumbing action — homed to project, NOT surfaced in Today
  D({ slug: 'reflection', label: 'Reflection', student_label: 'Reflection', bucket: 'reflect', render_band: 'reflection', est_minutes: 10, learning_xp: 15, builder_xp: 5, competencies: ['leadership'], ai_evaluation: true, prompt_pairs: ['reflection'] }),
  D({ slug: 'community_discussion', label: 'Community Discussion', student_label: 'Community Discussion', bucket: 'share', render_band: 'community', est_minutes: 15, community_xp: 20, competencies: ['communication'], home_surface: 'community' }),
  D({ slug: 'presentation', label: 'Presentation', student_label: 'Presentation', bucket: 'share', render_band: 'presentation', est_minutes: 30, builder_xp: 60, community_xp: 10, difficulty: 'stretch', competencies: ['communication', 'leadership'], evidence_required: true, ai_evaluation: true, instructor_review: true, portfolio_eligible: true, prompt_pairs: ['mentor'] }), // ⚑ graded curriculum deliverable kept in class; could be community/group
  D({ slug: 'study_session', label: 'Study Session', student_label: 'Study Session', bucket: 'practice', render_band: 'study', est_minutes: 45, learning_xp: 10, community_xp: 5 }),
  D({ slug: 'demo', label: 'Demo', student_label: 'Demo', bucket: 'share', render_band: 'demo', est_minutes: 20, builder_xp: 40, community_xp: 10, difficulty: 'core', competencies: ['communication'], evidence_required: true, portfolio_eligible: true, prompt_pairs: ['mentor'], home_surface: 'community' }), // ⚑ peer showcase → community; could be project
  D({ slug: 'internship_activity', label: 'Internship Activity', student_label: 'Internship Activity', bucket: 'advance', render_band: 'task', est_minutes: 90, builder_xp: 70, difficulty: 'stretch', competencies: ['architecture', 'deployment'], evidence_required: true, github_required: true, instructor_review: true, portfolio_eligible: true, prompt_pairs: ['build', 'mentor'] }), // ⚑ kept class; could be project
  D({ slug: 'demo_tuesday', label: 'Demo Tuesday', student_label: 'Demo Tuesday', bucket: 'share', render_band: 'event', est_minutes: 60, event: true, home_surface: 'group' }),
  D({ slug: 'kes_wednesday', label: 'Kes Wednesday', student_label: 'Kes Wednesday', bucket: 'learn', render_band: 'event', est_minutes: 60, event: true, home_surface: 'group' }),
  D({ slug: 'marketing_friday', label: 'Marketing Friday', student_label: 'Marketing Friday', bucket: 'share', render_band: 'event', est_minutes: 60, event: true, home_surface: 'group' }),
  // Colaberry Commons — the ONE canonical live-room curriculum type (spec §6).
  // Its 8 variants (study/build_room/demo/office_hours/architecture_review/
  // cert_prep/accountability/networking) are a per-card variable, NOT separate
  // types. Reuses the existing 'event' renderer (delivers a card, awards no XP
  // itself) on the community surface.
  D({ slug: 'community_live_session', label: 'Community Live Session', student_label: 'Live Session', bucket: 'share', render_band: 'event', est_minutes: 60, community_xp: 10, event: true, competencies: ['communication'], home_surface: 'community' }),
  // System types — engine-emitted gamification. No home but Today; injected, not authored → ambient.
  D({ slug: 'milestone', label: 'Milestone', student_label: 'Milestone', bucket: 'advance', render_band: 'milestone', est_minutes: 0, system: true, home_surface: 'today', feed_mode: 'ambient' }),
  D({ slug: 'achievement', label: 'Achievement', student_label: 'Achievement', bucket: 'advance', render_band: 'achievement', est_minutes: 0, system: true, home_surface: 'today', feed_mode: 'ambient' }),
  D({ slug: 'daily_streak', label: 'Daily Streak', student_label: 'Daily Streak', bucket: 'advance', render_band: 'streak', est_minutes: 0, system: true, home_surface: 'today', feed_mode: 'ambient' }),
  D({ slug: 'completion_badge', label: 'Completion Badge', student_label: 'Completion Badge', bucket: 'advance', render_band: 'badge', est_minutes: 0, system: true, home_surface: 'today', feed_mode: 'ambient' }),
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
