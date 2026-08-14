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
 * `builder_xp` IS DELIBERATELY NULL. Ali has not decided whether a story is
 * worth a fixed amount or a share of a fixed per-build budget divided across
 * its stories, and the two produce different numbers. `getTypeXp` resolves NULL
 * to 0, so verification records complete, auditable evidence today and awards
 * nothing until somebody sets the value. Seeding a plausible placeholder would
 * ship a number nobody chose as though somebody had, and it would be
 * indistinguishable from a decision once it was live.
 *
 * `findOrCreate`, so setting the value in the table survives every redeploy.
 */
export const BUILD_STORY_POINTS_KEY = 'project_story_verified';

export async function seedBuildStoryPointsConfig(): Promise<number> {
  const [, created] = await PointsConfig.findOrCreate({
    where: { scope: 'type_default', key: BUILD_STORY_POINTS_KEY },
    defaults: {
      scope: 'type_default',
      key: BUILD_STORY_POINTS_KEY,
      learning_xp: 0,
      builder_xp: null,      // UNSET — pending a decision, not "zero on purpose"
      community_xp: 0,
      config: {
        award_model: 'undecided',
        note: 'Set builder_xp to award XP for a verified build story. Left NULL because the '
          + 'fixed-per-story vs fixed-budget-per-build question is not decided. See '
          + 'docs/BUILD_VERIFICATION_CONTRACT.md.',
      },
      is_active: true,
    },
  });
  return created ? 1 : 0;
}

export async function seedProgressionConfig(): Promise<{ domains: number; levels: number; points: number }> {
  const domains = await seedCompetencyDomains();
  const levels = await seedBuilderLevels();
  const points = (await seedPointsConfigFromRegistry()) + (await seedBuildStoryPointsConfig());
  return { domains, levels, points };
}
