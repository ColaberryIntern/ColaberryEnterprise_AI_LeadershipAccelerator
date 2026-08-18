/**
 * Idempotent seeders for the progression config: competency domains, the
 * Builder level ladder, and points_config type defaults. All upsert by natural
 * key so re-running is safe. Config is data — thresholds live here as SEEDS and
 * can be edited in the tables afterward.
 */
import CompetencyDomain from '../../models/CompetencyDomain';
import BuilderLevel from '../../models/BuilderLevel';
import PointsConfig from '../../models/PointsConfig';
import { CARD_TYPES } from '../timeline/typeRegistry';
import { AWARD_MODEL_BUDGET_PER_BUILD } from './pointsConfigService';

export const COMPETENCY_DOMAINS: Array<{ domain_id: string; name: string; weight: number }> = [
  { domain_id: 'prompt_engineering', name: 'Prompt Engineering', weight: 1.4 },
  { domain_id: 'context_engineering', name: 'Context Engineering', weight: 1.2 },
  { domain_id: 'architecture', name: 'Architecture', weight: 1.4 },
  { domain_id: 'testing', name: 'Testing', weight: 1.0 },
  { domain_id: 'debugging', name: 'Debugging', weight: 1.0 },
  { domain_id: 'deployment', name: 'Deployment', weight: 1.0 },
  { domain_id: 'github', name: 'GitHub', weight: 0.8 },
  { domain_id: 'communication', name: 'Communication', weight: 1.0 },
  { domain_id: 'leadership', name: 'Leadership', weight: 1.0 },
  { domain_id: 'security', name: 'Security', weight: 1.0 },
  { domain_id: 'documentation', name: 'Documentation', weight: 0.8 },
];

type Comp = { domain_id: string; min_confidence: number };
interface LevelSeed {
  slug: string; rank: number; label: string;
  required_competencies: Comp[];
  min_evidence: number; min_artifacts: number; min_github: number;
  min_evaluations: number; min_implementation: number; min_attendance: number;
  requires_ai_approval: boolean;
}

export const BUILDER_LEVELS: LevelSeed[] = [
  { slug: 'builder', rank: 0, label: 'Builder', required_competencies: [], min_evidence: 0, min_artifacts: 0, min_github: 0, min_evaluations: 0, min_implementation: 0, min_attendance: 0, requires_ai_approval: false },
  { slug: 'junior_builder', rank: 1, label: 'Junior Builder', required_competencies: [], min_evidence: 3, min_artifacts: 0, min_github: 0, min_evaluations: 0, min_implementation: 1, min_attendance: 1, requires_ai_approval: false },
  { slug: 'practitioner', rank: 2, label: 'Practitioner', required_competencies: [{ domain_id: 'prompt_engineering', min_confidence: 0.4 }], min_evidence: 6, min_artifacts: 2, min_github: 2, min_evaluations: 0, min_implementation: 2, min_attendance: 2, requires_ai_approval: false },
  { slug: 'developer', rank: 3, label: 'Developer', required_competencies: [{ domain_id: 'prompt_engineering', min_confidence: 0.5 }, { domain_id: 'architecture', min_confidence: 0.4 }], min_evidence: 10, min_artifacts: 3, min_github: 4, min_evaluations: 1, min_implementation: 3, min_attendance: 3, requires_ai_approval: false },
  { slug: 'senior_developer', rank: 4, label: 'Senior Developer', required_competencies: [{ domain_id: 'prompt_engineering', min_confidence: 0.6 }, { domain_id: 'architecture', min_confidence: 0.5 }, { domain_id: 'testing', min_confidence: 0.4 }], min_evidence: 15, min_artifacts: 5, min_github: 6, min_evaluations: 2, min_implementation: 5, min_attendance: 4, requires_ai_approval: false },
  { slug: 'engineer', rank: 5, label: 'Engineer', required_competencies: [{ domain_id: 'prompt_engineering', min_confidence: 0.65 }, { domain_id: 'architecture', min_confidence: 0.6 }, { domain_id: 'testing', min_confidence: 0.5 }, { domain_id: 'deployment', min_confidence: 0.4 }], min_evidence: 22, min_artifacts: 7, min_github: 10, min_evaluations: 3, min_implementation: 7, min_attendance: 5, requires_ai_approval: true },
  { slug: 'senior_engineer', rank: 6, label: 'Senior Engineer', required_competencies: [{ domain_id: 'architecture', min_confidence: 0.65 }, { domain_id: 'testing', min_confidence: 0.6 }, { domain_id: 'deployment', min_confidence: 0.5 }, { domain_id: 'github', min_confidence: 0.5 }], min_evidence: 30, min_artifacts: 10, min_github: 15, min_evaluations: 4, min_implementation: 10, min_attendance: 6, requires_ai_approval: true },
  { slug: 'architect_candidate', rank: 7, label: 'Architect Candidate', required_competencies: [{ domain_id: 'architecture', min_confidence: 0.7 }, { domain_id: 'communication', min_confidence: 0.6 }, { domain_id: 'leadership', min_confidence: 0.5 }, { domain_id: 'security', min_confidence: 0.5 }], min_evidence: 40, min_artifacts: 14, min_github: 20, min_evaluations: 6, min_implementation: 14, min_attendance: 7, requires_ai_approval: true },
  { slug: 'architect', rank: 8, label: 'Architect', required_competencies: [{ domain_id: 'architecture', min_confidence: 0.75 }, { domain_id: 'prompt_engineering', min_confidence: 0.7 }, { domain_id: 'leadership', min_confidence: 0.65 }, { domain_id: 'communication', min_confidence: 0.65 }, { domain_id: 'security', min_confidence: 0.6 }, { domain_id: 'documentation', min_confidence: 0.6 }], min_evidence: 55, min_artifacts: 20, min_github: 28, min_evaluations: 8, min_implementation: 18, min_attendance: 8, requires_ai_approval: true },
];

export async function seedCompetencyDomains(): Promise<number> {
  let n = 0;
  for (const d of COMPETENCY_DOMAINS) {
    const [, created] = await CompetencyDomain.findOrCreate({
      where: { program_id: null, domain_id: d.domain_id },
      defaults: { program_id: null, domain_id: d.domain_id, name: d.name, weight: d.weight, confidence_threshold: 0.7, is_active: true },
    });
    if (created) n += 1;
  }
  return n;
}

export async function seedBuilderLevels(): Promise<number> {
  let n = 0;
  for (const l of BUILDER_LEVELS) {
    const [row, created] = await BuilderLevel.findOrCreate({ where: { slug: l.slug }, defaults: l as any });
    if (created) n += 1; else await row.update(l as any);
  }
  return n;
}

export async function seedPointsConfigFromRegistry(): Promise<number> {
  let n = 0;
  for (const t of CARD_TYPES) {
    const [, created] = await PointsConfig.findOrCreate({
      where: { scope: 'type_default', key: t.slug },
      defaults: {
        scope: 'type_default', key: t.slug,
        learning_xp: t.learning_xp, builder_xp: t.builder_xp, community_xp: t.community_xp,
        is_active: true,
      },
    });
    if (created) n += 1;
  }
  return n;
}

/**
 * The XP knob for a VERIFIED Student Build Pipeline story.
 *
 * A key of its own rather than reusing the `project_task` card type: the
 * curriculum economy and the build economy should be tunable independently.
 *
 * THE MODEL IS A BUDGET PER CAPSTONE, DIVIDED ACROSS THAT BUILD'S STORIES.
 * Ali chose this over a flat per-story rate so that a student is not rewarded
 * for their plan happening to decompose into more pieces: an 800 budget pays 40
 * a story across a 20-story build and 27 across a 30-story build, and the same
 * work is worth the same either way. `builder_xp` on this row is therefore the
 * WHOLE-BUILD BUDGET, not a per-story rate — `config.award_model` is what says
 * so, and pointsConfigService is the only thing allowed to divide it.
 *
 * STORY-000 (the Command Center) counts as an ordinary story and takes an equal
 * share. It is substantial and every student builds it, so weighting it would
 * mean a second config concept (per-story weights) for very little gain.
 */
export const BUILD_STORY_POINTS_KEY = 'project_story_verified';

/** Builder XP for one whole capstone, split across the stories in its plan. */
export const BUILD_STORY_XP_BUDGET = 800;

const BUILD_STORY_CONFIG = {
  award_model: AWARD_MODEL_BUDGET_PER_BUILD,
  note: 'builder_xp is a WHOLE-CAPSTONE BUDGET, not a per-story rate. A verified story '
    + 'awards round(builder_xp / number of stories in that project\'s published plan). '
    + 'Edit builder_xp to retune the economy. See docs/BUILD_VERIFICATION_CONTRACT.md.',
};

/**
 * Seed or adopt the build-story budget row.
 *
 * `findOrCreate` first, so a tuned budget survives every redeploy — this is a
 * live config knob and boot must never stamp on an operator's edit.
 *
 * The one exception is a NARROW, SELF-LIMITING migration: a row still carrying
 * `award_model: 'undecided'` is the placeholder the previous release seeded
 * (builder_xp NULL, awards resolving to 0). Nobody chose those values, so boot
 * adopts the decided budget over them exactly once. After that the row is on
 * the budget model and this function never touches it again, which is what
 * keeps a later retune from being silently reverted on the next deploy.
 */
export async function seedBuildStoryPointsConfig(): Promise<number> {
  const [row, created] = await PointsConfig.findOrCreate({
    where: { scope: 'type_default', key: BUILD_STORY_POINTS_KEY },
    defaults: {
      scope: 'type_default',
      key: BUILD_STORY_POINTS_KEY,
      learning_xp: 0,
      builder_xp: BUILD_STORY_XP_BUDGET,
      community_xp: 0,
      config: BUILD_STORY_CONFIG,
      is_active: true,
    },
  });
  if (created) return 1;

  const model = (row.config as Record<string, unknown> | null)?.award_model;
  if (model === 'undecided') {
    await row.update({ builder_xp: BUILD_STORY_XP_BUDGET, config: BUILD_STORY_CONFIG });
    return 1;
  }
  return 0;
}

export async function seedProgressionConfig(): Promise<{ domains: number; levels: number; points: number }> {
  const domains = await seedCompetencyDomains();
  const levels = await seedBuilderLevels();
  const points = (await seedPointsConfigFromRegistry()) + (await seedBuildStoryPointsConfig());
  return { domains, levels, points };
}
