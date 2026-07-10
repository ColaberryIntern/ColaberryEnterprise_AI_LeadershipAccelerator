/**
 * backfillService — migrates the legacy curriculum hierarchy into the Timeline
 * Engine WITHOUT losing student progress (MIGRATION_PLAN.md §3).
 *
 * Granularity: one card per CurriculumLesson (ref_kind='lesson'), because the
 * legacy progress unit is LessonInstance (per lesson). That makes
 * LessonInstance -> timeline_card_progress a clean 1:1 with zero data loss.
 * A lesson's MiniSections are folded into card.metadata.mini_section_ids for
 * the content renderer; finer mini-section-as-card granularity is a later
 * enhancement, not a migration blocker.
 *
 * Idempotent: cards upsert on (cohort_id, ref_kind, ref_id); progress upserts
 * on (card_id, enrollment_id). Re-running produces an identical end state.
 * Each cohort is wrapped in a transaction so a partial cohort never commits.
 */
import { sequelize } from '../../config/database';
import CurriculumModule from '../../models/CurriculumModule';
import CurriculumLesson from '../../models/CurriculumLesson';
import MiniSection from '../../models/MiniSection';
import LessonInstance from '../../models/LessonInstance';
import TimelineCard from '../../models/TimelineCard';
import TimelineCardProgress from '../../models/TimelineCardProgress';
import { mapLegacyType, resolve as resolveType } from './typeRegistry';

export interface BackfillResult {
  cohort_id: string;
  cards_created: number;
  cards_updated: number;
  progress_migrated: number;
  warnings: string[];
}

export async function backfillCohort(cohortId: string): Promise<BackfillResult> {
  const result: BackfillResult = {
    cohort_id: cohortId,
    cards_created: 0,
    cards_updated: 0,
    progress_migrated: 0,
    warnings: [],
  };

  await sequelize.transaction(async (t) => {
    const modules = await CurriculumModule.findAll({
      where: { cohort_id: cohortId },
      order: [['module_number', 'ASC']],
      transaction: t,
    });

    for (const mod of modules) {
      const lessons = await CurriculumLesson.findAll({
        where: { module_id: mod.id },
        order: [['lesson_number', 'ASC']],
        transaction: t,
      });

      for (const lesson of lessons) {
        const mapped = mapLegacyType(lesson.lesson_type);
        if (mapped.fallback) {
          result.warnings.push(`lesson ${lesson.id}: unmapped legacy type "${lesson.lesson_type}" -> overview`);
        }
        const def = resolveType(mapped.slug);

        const miniSections = await MiniSection.findAll({
          where: { lesson_id: lesson.id },
          order: [['mini_section_order', 'ASC']],
          transaction: t,
        });

        const cardFields = {
          type: mapped.slug,
          title: lesson.title,
          description: lesson.description || null,
          week: mod.module_number ?? null,
          bucket: (def?.bucket || 'learn') as any,
          visibility: 'published' as const,
          estimated_time: (lesson as any).estimated_minutes ?? null,
          difficulty: (def?.difficulty || 'core') as any,
          order: (lesson as any).sort_order ?? lesson.lesson_number ?? 0,
          ref_kind: 'lesson' as const,
          ref_id: lesson.id,
          cohort_id: cohortId,
          status: 'active' as const,
          metadata: {
            legacy_type: lesson.lesson_type,
            skill_area: (mod as any).skill_area ?? null,
            learning_goal: (lesson as any).learning_goal ?? null,
            mini_section_ids: miniSections.map((m) => m.id),
          },
        };

        const [card, created] = await TimelineCard.findOrCreate({
          where: { cohort_id: cohortId, ref_kind: 'lesson', ref_id: lesson.id },
          defaults: cardFields as any,
          transaction: t,
        });
        if (created) {
          result.cards_created += 1;
        } else {
          await card.update(cardFields as any, { transaction: t });
          result.cards_updated += 1;
        }

        // Migrate per-student progress 1:1 from LessonInstance.
        const instances = await LessonInstance.findAll({
          where: { lesson_id: lesson.id },
          transaction: t,
        });
        for (const inst of instances) {
          const progressFields = {
            card_id: card.id,
            enrollment_id: inst.enrollment_id,
            status: inst.status,
            student_progress: {
              structured: (inst as any).structured_responses_json ?? null,
              reflection: (inst as any).reflection_responses_json ?? null,
              quiz: (inst as any).quiz_responses_json ?? null,
              generated: (inst as any).generated_content_json ?? null,
            },
            quiz_score: (inst as any).quiz_score ?? null,
            attempts: (inst as any).attempts ?? 0,
            started_at: (inst as any).started_at ?? null,
            completed_at: (inst as any).completed_at ?? null,
          };
          const [prog, progCreated] = await TimelineCardProgress.findOrCreate({
            where: { card_id: card.id, enrollment_id: inst.enrollment_id },
            defaults: progressFields as any,
            transaction: t,
          });
          if (!progCreated) {
            await prog.update(progressFields as any, { transaction: t });
          }
          result.progress_migrated += 1;
        }
      }
    }
  });

  return result;
}
