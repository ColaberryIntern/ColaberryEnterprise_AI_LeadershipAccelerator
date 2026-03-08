import { Enrollment, Cohort } from '../models';
import CurriculumModule from '../models/CurriculumModule';
import CurriculumLesson from '../models/CurriculumLesson';
import LessonInstance from '../models/LessonInstance';
import UserCurriculumProfile from '../models/UserCurriculumProfile';

export async function exportProjectArchitectData(enrollmentId: string) {
  // 1. Fetch enrollment with cohort
  const enrollment = await Enrollment.findByPk(enrollmentId, {
    include: [{ model: Cohort, as: 'cohort' }],
  });

  if (!enrollment) {
    throw new Error(`Enrollment not found: ${enrollmentId}`);
  }

  // 2. Fetch curriculum profile
  const profile = await UserCurriculumProfile.findOne({
    where: { enrollment_id: enrollmentId },
  });

  // 3. Fetch all lesson instances with lesson and module
  const lessonInstances = await LessonInstance.findAll({
    where: { enrollment_id: enrollmentId },
    include: [
      {
        model: CurriculumLesson,
        as: 'lesson',
        include: [{ model: CurriculumModule, as: 'module' }],
      },
    ],
    order: [
      [{ model: CurriculumLesson, as: 'lesson' }, { model: CurriculumModule, as: 'module' }, 'module_number', 'ASC'],
      [{ model: CurriculumLesson, as: 'lesson' }, 'lesson_number', 'ASC'],
    ],
  });

  // 4. Aggregate curriculum progress by module
  const moduleMap = new Map<string, { title: string; module_number: number; total: number; completed: number }>();

  for (const instance of lessonInstances) {
    const lesson = (instance as any).lesson as CurriculumLesson;
    const mod = (lesson as any).module as CurriculumModule;
    const moduleId = mod.id;

    if (!moduleMap.has(moduleId)) {
      moduleMap.set(moduleId, {
        title: mod.title,
        module_number: mod.module_number,
        total: 0,
        completed: 0,
      });
    }
    const entry = moduleMap.get(moduleId)!;
    entry.total += 1;
    if (instance.status === 'completed') {
      entry.completed += 1;
    }
  }

  const modules = Array.from(moduleMap.values())
    .sort((a, b) => a.module_number - b.module_number)
    .map((m) => ({
      module_number: m.module_number,
      title: m.title,
      lessons_total: m.total,
      lessons_completed: m.completed,
      completed: m.completed === m.total && m.total > 0,
    }));

  const totalLessons = lessonInstances.length;
  const completedLessons = lessonInstances.filter((li) => li.status === 'completed').length;
  const overallProgressPct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  // 5. Build lab_responses
  const labResponses = lessonInstances
    .filter((li) => li.structured_responses_json || li.reflection_responses_json)
    .map((li) => {
      const lesson = (li as any).lesson as CurriculumLesson;
      const mod = (lesson as any).module as CurriculumModule;
      return {
        module_title: mod.title,
        module_number: mod.module_number,
        lesson_title: lesson.title,
        lesson_number: lesson.lesson_number,
        lesson_type: lesson.lesson_type,
        structured_responses: li.structured_responses_json || null,
        reflection_responses: li.reflection_responses_json || null,
        completed_at: li.completed_at || null,
      };
    });

  // 6. Build assessment_results
  const assessmentResults = lessonInstances
    .filter((li) => {
      const lesson = (li as any).lesson as CurriculumLesson;
      return lesson.lesson_type === 'assessment';
    })
    .map((li) => {
      const lesson = (li as any).lesson as CurriculumLesson;
      return {
        lesson_title: lesson.title,
        quiz_score: li.quiz_score ?? null,
        attempts: li.attempts,
      };
    });

  // 7. Assemble final export
  return {
    exported_at: new Date().toISOString(),
    enrollment_id: enrollmentId,

    participant: {
      full_name: enrollment.full_name,
      email: enrollment.email,
      company: enrollment.company,
      title: enrollment.title || null,
    },

    curriculum_profile: profile
      ? {
          industry: profile.industry || null,
          company_name: profile.company_name || null,
          company_size: profile.company_size || null,
          role: profile.role || null,
          goal: profile.goal || null,
          ai_maturity_level: profile.ai_maturity_level ?? null,
          identified_use_case: profile.identified_use_case || null,
        }
      : null,

    readiness_metrics: {
      readiness_score: enrollment.readiness_score ?? null,
      prework_score: enrollment.prework_score ?? null,
      attendance_score: enrollment.attendance_score ?? null,
      assignment_score: enrollment.assignment_score ?? null,
    },

    curriculum_progress: {
      overall_progress_pct: overallProgressPct,
      total_lessons: totalLessons,
      completed_lessons: completedLessons,
      modules,
    },

    lab_responses: labResponses,
    assessment_results: assessmentResults,
  };
}
