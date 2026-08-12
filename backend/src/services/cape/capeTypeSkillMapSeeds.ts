/**
 * capeTypeSkillMapSeeds — generates and seeds one `curriculum_skill_maps` type-scope
 * row per registered Curriculum Type (design doc §7 "Required curriculum-to-skill
 * contract" + "Default policies for all 50 registered types" table).
 *
 * Reconciliation (execution-contract.md "Repository facts"): `typeRegistry.ts`'s
 * `allTypes()` returns exactly 50 slugs, an EXACT 1:1 match to the design doc's §7
 * 8-group table (8+10+5+8+6+4+5+4=50) — no slug mismatch to handle.
 *
 * Derivation algorithm (execution-contract.md Assumption 2), applied per type:
 *  1. `ZERO_CREDIT_GROUPS` (community practice, delivery events, system/gamification —
 *     §7's own "zero skill credit" / "normally zero/low" / "event attendance itself
 *     gives no credit" groups) always get an EXPLICIT `skill_impacts:[]` row — a real
 *     row that exists with no impacts, never a silently-missing type (§17 AC 4).
 *  2. Any other type with a non-empty legacy `competencies` array crosswalks through
 *     `COMPETENCY_TO_SKILL` (shared with the pre-Phase-3 evidence bridge, moved to
 *     `constants/competencySkillCrosswalk.ts` in this task), weight split evenly.
 *  3. The ~7 remaining types with an EMPTY `competencies` array in a non-zero-credit
 *     group (`EMPTY_COMPETENCY_MANUAL_DEFAULTS`) get a documented manual skill
 *     assignment — this is what actually fixes the Phase 0-1 `knowledge_check` gap at
 *     the data layer (T005), which T011 then wires the evidence writer to consume.
 * Band / credit_strength / max_credit are derived from each type's actual
 * `evidence_required` / `ai_evaluation` / `github_required` / `instructor_review` flags
 * via `tierFor()`, a generalized version of Phase 0-1's `bandAndCreditFor` (now
 * covering the fuller §6 credit-speed bracket, not just 3 tiers). The Judgment/
 * Communication policy group always includes the `judgment` band, per §7.
 *
 * This is a coarse TYPE-DEFAULT fallback — the week-level tier (T006, capeWeekSkillMapSeeds.ts)
 * supersedes it for any card with a week number, which is the common case; a type
 * default only matters for a week-less card or a week with no seeded target.
 */
import { allTypes, CardTypeDef } from '../timeline/typeRegistry';
import { COMPETENCY_TO_SKILL } from '../../constants/competencySkillCrosswalk';
import type { ArchitectureSkillId } from '../../constants/architectureSkills';
import type { ArchitectureSkillImpact, EvidenceBandName, CreditStrength } from '../../models/CurriculumSkillMap';
import CurriculumSkillMap from '../../models/CurriculumSkillMap';

export type PolicyGroup =
  | 'orientation' | 'intelligence' | 'checks' | 'prompt_build'
  | 'judgment' | 'community' | 'delivery_events' | 'system';

/** design doc §7 8-group table, transcribed slug-for-slug. */
export const POLICY_GROUPS: Record<PolicyGroup, string[]> = {
  orientation: ['announcement', 'video', 'testimonial', 'podcast', 'blog', 'warmup', 'deep_dive', 'anthropic_skills_jar'],
  intelligence: ['ai_news_flash', 'ai_research_digest', 'ai_tool_of_the_day', 'ai_video_stream', 'ai_quote_of_the_day', 'ai_architecture_breakdown', 'build_breakdown', 'mcp_server_spotlight', 'claude_code_technique', 'market_intelligence'],
  checks: ['knowledge_check', 'survey', 'question', 'evaluation', 'certification_exercise'],
  prompt_build: ['prompt_lab', 'prompt_challenge', 'implementation_task', 'setup_lab', 'artifact_submission', 'project_task', 'build_story', 'internship_activity'],
  judgment: ['reflection', 'architect_mindset', 'ai_video_feedback', 'mock_interview', 'presentation', 'demo'],
  community: ['discussion', 'community_discussion', 'study_session', 'community_live_session'],
  delivery_events: ['live_class', 'event', 'demo_tuesday', 'kes_wednesday', 'marketing_friday'],
  system: ['milestone', 'achievement', 'daily_streak', 'completion_badge'],
};

const ZERO_CREDIT_GROUPS: PolicyGroup[] = ['community', 'delivery_events', 'system'];

/** The ~7 types whose legacy `competencies` array is empty AND whose policy group is
 * NOT zero-credit — they need a manual skill assignment since there's nothing to
 * crosswalk. `knowledge_check` is the exact Phase 0-1 gap this closes. */
const EMPTY_COMPETENCY_MANUAL_DEFAULTS: Record<string, ArchitectureSkillId[]> = {
  // orientation, empty competencies -> foundational AI-literacy content
  announcement: ['llm_core'], video: ['llm_core'], testimonial: ['llm_core'],
  podcast: ['llm_core'], blog: ['llm_core'], warmup: ['llm_core'],
  // intelligence/AI Pulse, empty competencies -> matches its siblings' architecture->system_design crosswalk
  ai_news_flash: ['system_design'], ai_video_stream: ['system_design'],
  // checks, empty competencies -> the 4 most cross-curriculum-frequent skills (§8 week table),
  // evenly split, so a generic check isn't arbitrarily pinned to one axis
  knowledge_check: ['agents_mcp', 'system_design', 'eval_guardrails', 'governance'],
  survey: ['agents_mcp', 'system_design', 'eval_guardrails', 'governance'],
  question: ['agents_mcp', 'system_design', 'eval_guardrails', 'governance'],
};

function policyGroupFor(slug: string): PolicyGroup {
  for (const group of Object.keys(POLICY_GROUPS) as PolicyGroup[]) {
    if (POLICY_GROUPS[group].includes(slug)) return group;
  }
  throw new Error(`[capeTypeSkillMapSeeds] type "${slug}" is not assigned to any design-doc §7 policy group`);
}

interface Tier { credit_strength: CreditStrength; bands: EvidenceBandName[]; total_max_credit: number }

/** Generalizes Phase 0-1's `bandAndCreditFor` across the full §6 credit-speed bracket. */
function tierFor(def: CardTypeDef): Tier {
  if (def.evidence_required && def.github_required && def.instructor_review) {
    return { credit_strength: 'capstone', bands: ['application', 'judgment'], total_max_credit: 25 };
  }
  if (def.evidence_required && (def.github_required || def.instructor_review)) {
    return { credit_strength: 'high', bands: ['application', 'judgment'], total_max_credit: 20 };
  }
  if (def.evidence_required && def.ai_evaluation) {
    return { credit_strength: 'medium', bands: ['application'], total_max_credit: 12 };
  }
  if (def.evidence_required) {
    return { credit_strength: 'medium', bands: ['application'], total_max_credit: 10 };
  }
  if (def.ai_evaluation) {
    return { credit_strength: 'medium', bands: ['knowledge', 'judgment'], total_max_credit: 4 };
  }
  return { credit_strength: 'low', bands: ['knowledge'], total_max_credit: 2 };
}

/** design doc §11 "Foundation, Working, Stretch, Architect" translated to the 0-100
 * proficiency scale (execution-contract.md Assumption 3). */
function recommendedRangeFor(def: CardTypeDef): { min: number; max: number } {
  if (def.difficulty === 'intro') return { min: 0, max: 40 };
  if (def.difficulty === 'stretch') return { min: 50, max: 100 };
  return { min: 20, max: 70 };
}

function resolveSkillIds(def: CardTypeDef): ArchitectureSkillId[] {
  if (def.competencies && def.competencies.length > 0) {
    const seen = new Set<ArchitectureSkillId>();
    for (const c of def.competencies) {
      const skill = COMPETENCY_TO_SKILL[c];
      if (skill) seen.add(skill);
    }
    if (seen.size > 0) return Array.from(seen);
  }
  return EMPTY_COMPETENCY_MANUAL_DEFAULTS[def.slug] ?? [];
}

export interface TypeSkillMapDraft {
  type_slug: string;
  skill_impacts: ArchitectureSkillImpact[];
  recommended_range: { min: number; max: number };
  freshness_days: number | null;
}

/** Pure function: given a registered type, compute its type-default draft. Exported
 * separately from the seeder so it's directly unit-testable without touching the DB. */
export function computeTypeSkillMapDraft(def: CardTypeDef): TypeSkillMapDraft {
  const group = policyGroupFor(def.slug);
  const recommended_range = recommendedRangeFor(def);

  if (ZERO_CREDIT_GROUPS.includes(group)) {
    // Explicit, non-missing zero-credit declaration (§17 AC 4) — the row exists with
    // an empty skill_impacts array, not simply absent.
    return { type_slug: def.slug, skill_impacts: [], recommended_range, freshness_days: null };
  }

  const skillIds = resolveSkillIds(def);
  if (skillIds.length === 0) {
    // Defensive fallback — should be unreachable given EMPTY_COMPETENCY_MANUAL_DEFAULTS
    // covers every non-zero-credit type with empty competencies; treat as zero-credit
    // rather than silently guessing a skill.
    return { type_slug: def.slug, skill_impacts: [], recommended_range, freshness_days: null };
  }

  const tier = tierFor(def);
  const bands = group === 'judgment' && !tier.bands.includes('judgment')
    ? [...tier.bands, 'judgment' as EvidenceBandName]
    : tier.bands;
  const weight = Math.round((1 / skillIds.length) * 10000) / 10000;
  const maxCreditPerSkill = Math.round((tier.total_max_credit / skillIds.length) * 100) / 100;

  const skill_impacts: ArchitectureSkillImpact[] = skillIds.map((skill_id) => ({
    skill_id,
    weight,
    bands,
    credit_strength: tier.credit_strength,
    evidence_required: def.evidence_required,
    max_credit: maxCreditPerSkill,
  }));

  const freshness_days = group === 'intelligence' ? 21 : null;

  return { type_slug: def.slug, skill_impacts, recommended_range, freshness_days };
}

/** All 50 drafts, one per registered type — the direct input to both the seeder and
 * the "exactly 50 rows, zero missing, zero duplicated" test. */
export function computeAllTypeSkillMapDrafts(): TypeSkillMapDraft[] {
  return allTypes().map(computeTypeSkillMapDraft);
}

/**
 * Idempotent seeder: `findOrCreate`s a version-1, `is_current:true`, `source:'human'`,
 * `approved:true` row per type slug. Only inserts when no current row exists yet for
 * that `type_slug` — re-running boot never overwrites an admin's later edit (an edit
 * goes through `capeCurriculumSkillMapService.createOrVersionMapping`, which is the
 * only path that can change an existing current row).
 */
export async function seedTypeSkillMaps(): Promise<{ created: number; skipped: number }> {
  const drafts = computeAllTypeSkillMapDrafts();
  let created = 0;
  let skipped = 0;
  for (const draft of drafts) {
    const [, wasCreated] = await CurriculumSkillMap.findOrCreate({
      where: { scope_type: 'type', type_slug: draft.type_slug, is_current: true },
      defaults: {
        scope_type: 'type',
        type_slug: draft.type_slug,
        skill_impacts: draft.skill_impacts,
        prerequisite_skills: [],
        recommended_range: draft.recommended_range,
        freshness_days: draft.freshness_days,
        reviewable: true,
        source: 'human',
        approved: true,
        version: 1,
        is_current: true,
        created_by: 'system:capeTypeSkillMapSeeds',
      } as any,
    });
    if (wasCreated) created += 1; else skipped += 1;
  }
  return { created, skipped };
}
