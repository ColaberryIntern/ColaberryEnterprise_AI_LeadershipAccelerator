/**
 * Seeds `curriculum_type_definitions` from the code-side registry so the 36
 * canonical types exist as data with their Timeline Engine metadata. Idempotent
 * upsert by slug: existing rows are updated in place, none are duplicated.
 */
import CurriculumTypeDefinition from '../../models/CurriculumTypeDefinition';
import { CARD_TYPES } from './typeRegistry';

export interface TypeSeedResult {
  created: number;
  updated: number;
  total: number;
}

export async function seedCurriculumTypeDefinitions(): Promise<TypeSeedResult> {
  let created = 0;
  let updated = 0;

  for (const t of CARD_TYPES) {
    const [, wasCreated] = await CurriculumTypeDefinition.findOrCreate({
      where: { slug: t.slug },
      defaults: {
        slug: t.slug,
        label: t.label,
        student_label: t.student_label,
        is_system: true,
        is_active: true,
        can_create_variables: t.prompt_pairs.includes('build'),
        can_create_artifacts: t.evidence_required,
        applicable_prompt_pairs: t.prompt_pairs,
        bucket_default: t.bucket,
        render_band: t.render_band,
        estimated_time: t.est_minutes,
        learning_xp: t.learning_xp,
        builder_xp: t.builder_xp,
        community_xp: t.community_xp,
        difficulty: t.difficulty,
        competencies: t.competencies,
        evidence_required: t.evidence_required,
        github_required: t.github_required,
        ai_evaluation: t.ai_evaluation,
        instructor_review: t.instructor_review,
        portfolio_eligible: t.portfolio_eligible,
        home_surface: t.home_surface,
        feed_mode: t.feed_mode,
        today_eligible: t.today_eligible,
      },
    });

    if (wasCreated) {
      created += 1;
    } else {
      // Refresh the Timeline Engine metadata on the existing row (keeps admin
      // edits to label/description but re-asserts the registry defaults).
      await CurriculumTypeDefinition.update(
        {
          bucket_default: t.bucket,
          render_band: t.render_band,
          estimated_time: t.est_minutes,
          learning_xp: t.learning_xp,
          builder_xp: t.builder_xp,
          community_xp: t.community_xp,
          difficulty: t.difficulty,
          competencies: t.competencies,
          evidence_required: t.evidence_required,
          github_required: t.github_required,
          ai_evaluation: t.ai_evaluation,
          instructor_review: t.instructor_review,
          portfolio_eligible: t.portfolio_eligible,
          applicable_prompt_pairs: t.prompt_pairs,
          home_surface: t.home_surface,
          feed_mode: t.feed_mode,
          today_eligible: t.today_eligible,
        },
        { where: { slug: t.slug } }
      );
      updated += 1;
    }
  }

  return { created, updated, total: CARD_TYPES.length };
}
