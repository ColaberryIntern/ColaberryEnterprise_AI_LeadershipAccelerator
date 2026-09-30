/**
 * Idempotent seed for the ONE canonical course: AI Systems Architect Accelerator (12 weeks).
 *
 * Turns the typed CANONICAL_COURSE (data/canonicalCourse.ts) into:
 *   ProgramBlueprint  (the course)
 *   Cohort            (Cohort 1 — July 2026)
 *   CurriculumModule  × 12  (one week-module per week, tagged intensive 1..4)
 *   CurriculumLesson  × 60  (the weekly 5-task checklist)
 *   LiveSession       × 24  (Mon Architecture core + Thu Build lab, per week)
 *
 * Safe to re-run: findOrCreate + update, and only missing columns are added.
 * Creates a NEW program + NEW cohort, so it does not disturb the demo curriculum
 * that seedProgramCurriculum() writes to the earliest cohort on startup.
 *
 * Run:  cd backend && npx ts-node src/seeds/seedCanonicalCourse.ts
 * Doc:  docs/training-program-2026-q3/CANONICAL_COURSE_STRUCTURE.md
 */
import { DataTypes } from 'sequelize';
import { connectDatabase, sequelize } from '../config/database';
import '../models';
import { Cohort } from '../models';
import ProgramBlueprint from '../models/ProgramBlueprint';
import CurriculumModule from '../models/CurriculumModule';
import CurriculumLesson from '../models/CurriculumLesson';
import LiveSession from '../models/LiveSession';
import { CANONICAL_COURSE, allWeeks, buildWeeklyLessons } from '../data/canonicalCourse';

/** Add only the canonical-course columns that don't yet exist on curriculum_modules. */
async function ensureModuleColumns(): Promise<void> {
  const qi = sequelize.getQueryInterface();
  // Make sure the table exists (fresh DB): sync creates it with all columns already declared
  // on the model, so the addColumn loop below is a no-op there and only fills gaps on an
  // existing table missing the new columns.
  await CurriculumModule.sync();
  let table: Record<string, any>;
  try {
    table = await qi.describeTable('curriculum_modules');
  } catch {
    return; // table just created with the full model definition — nothing to backfill
  }
  const columns: Record<string, any> = {
    intensive_number: { type: DataTypes.INTEGER, allowNull: true },
    intensive_title: { type: DataTypes.STRING(255), allowNull: true },
    intensive_standalone_value: { type: DataTypes.TEXT, allowNull: true },
    intensive_build_due: { type: DataTypes.DATEONLY, allowNull: true },
    week_number: { type: DataTypes.INTEGER, allowNull: true },
    anthropic_course_title: { type: DataTypes.STRING(255), allowNull: true },
    anthropic_course_slug: { type: DataTypes.STRING(255), allowNull: true },
    anthropic_course_url: { type: DataTypes.STRING(500), allowNull: true },
    anthropic_course_status: { type: DataTypes.STRING(30), allowNull: true },
  };
  for (const [name, def] of Object.entries(columns)) {
    if (!table[name]) {
      await qi.addColumn('curriculum_modules', name, def);
      console.log(`[canonical-course] + column curriculum_modules.${name}`);
    }
  }
}

export async function seedCanonicalCourse(): Promise<void> {
  const course = CANONICAL_COURSE;
  let modulesCreated = 0;
  let lessonsCreated = 0;
  let sessionsCreated = 0;

  await ensureModuleColumns();

  // --- Program blueprint (the course) ---
  const [blueprint] = await ProgramBlueprint.findOrCreate({
    where: { name: course.program.name },
    defaults: {
      name: course.program.name,
      description: course.program.description,
      goals: course.program.goals,
      target_persona: course.program.target_persona,
      learning_philosophy: course.program.learning_philosophy,
      core_competency_domains: course.program.core_competency_domains,
      default_prompt_injection_rules: course.program.default_prompt_injection_rules,
      is_active: true,
      version: 1,
    } as any,
  });
  await blueprint.update({
    description: course.program.description,
    goals: course.program.goals,
    target_persona: course.program.target_persona,
    learning_philosophy: course.program.learning_philosophy,
    core_competency_domains: course.program.core_competency_domains,
    default_prompt_injection_rules: course.program.default_prompt_injection_rules,
  } as any);

  // --- Cohort (first run) ---
  const [cohort] = await Cohort.findOrCreate({
    where: { name: course.cohort.name },
    defaults: {
      name: course.cohort.name,
      description: course.cohort.description,
      start_date: course.cohort.start_date,
      core_day: course.cohort.core_day,
      core_time: course.cohort.core_time,
      optional_lab_day: course.cohort.optional_lab_day,
      timezone: course.cohort.timezone,
      max_seats: course.cohort.max_seats,
      seats_taken: 0,
      status: 'open',
      cohort_type: 'accelerator',
      curriculum_version: 'canonical-v1',
      program_id: blueprint.id,
    } as any,
  });
  if (cohort.program_id !== blueprint.id) {
    await cohort.update({ program_id: blueprint.id });
  }
  const cohortId = cohort.id;

  // --- Week-modules + weekly lessons + sessions ---
  for (const week of allWeeks(course)) {
    const intensive = week.intensive;
    const moduleDefaults = {
      cohort_id: cohortId,
      program_id: blueprint.id,
      module_number: week.week_number,
      title: `Week ${week.week_number}: ${week.theme}`,
      description: `Intensive ${intensive.intensive_number} — ${intensive.title}. ${intensive.standalone_value}`,
      skill_area: week.skill_area,
      total_lessons: 5,
      unlock_rule: 'sequential' as const,
      intensive_number: intensive.intensive_number,
      intensive_title: intensive.title,
      intensive_standalone_value: intensive.standalone_value,
      intensive_build_due: intensive.build_due,
      week_number: week.week_number,
      anthropic_course_title: week.anthropic.title,
      anthropic_course_slug: week.anthropic.slug,
      anthropic_course_url: week.anthropic.url,
      anthropic_course_status: week.anthropic.status,
    };

    const [mod, modCreated] = await CurriculumModule.findOrCreate({
      where: { cohort_id: cohortId, module_number: week.week_number },
      defaults: moduleDefaults as any,
    });
    if (modCreated) {
      modulesCreated++;
    } else {
      await mod.update(moduleDefaults as any);
    }

    // Weekly 5-task checklist
    for (const lessonDef of buildWeeklyLessons(week)) {
      const lessonDefaults = {
        module_id: mod.id,
        lesson_number: lessonDef.lesson_number,
        title: lessonDef.title,
        description: lessonDef.description,
        lesson_type: lessonDef.lesson_type,
        estimated_minutes: lessonDef.estimated_minutes,
        requires_structured_input: lessonDef.requires_structured_input,
        completion_requirements: lessonDef.completion_requirements,
        content_template_json: lessonDef.content_template_json,
        sort_order: lessonDef.lesson_number,
      };
      const [, lessonCreated] = await CurriculumLesson.findOrCreate({
        where: { module_id: mod.id, lesson_number: lessonDef.lesson_number },
        defaults: lessonDefaults as any,
      });
      if (lessonCreated) {
        lessonsCreated++;
      } else {
        await CurriculumLesson.update(lessonDefaults as any, {
          where: { module_id: mod.id, lesson_number: lessonDef.lesson_number },
        });
      }
    }

    // Two live sessions: Mon Architecture (core), Thu Build (lab)
    const isExpoWeek = week.week_number === 12;
    const sessions = [
      {
        session_number: week.week_number * 2 - 1,
        title: `Wk${week.week_number} Architecture Day — ${week.theme}`,
        session_date: week.mon_date,
        session_type: 'core' as const,
        skill_area: week.skill_area,
        presentation_phase_flag: false,
      },
      {
        session_number: week.week_number * 2,
        title: `Wk${week.week_number} Build Day — ${week.theme}`,
        session_date: week.thu_date,
        session_type: 'lab' as const,
        skill_area: week.skill_area,
        presentation_phase_flag: isExpoWeek,
      },
    ];
    for (const s of sessions) {
      const sessionDefaults = {
        cohort_id: cohortId,
        session_number: s.session_number,
        title: s.title,
        description: `Intensive ${intensive.intensive_number} — ${intensive.title}. Anthropic: ${week.anthropic.title || 'Colaberry-authored'}.`,
        session_date: s.session_date,
        start_time: '1:00 PM',
        end_time: '3:00 PM',
        session_type: s.session_type,
        status: 'scheduled' as const,
        module_id: mod.id,
        skill_area: s.skill_area,
        presentation_phase_flag: s.presentation_phase_flag,
        curriculum_json: { week_number: week.week_number, theme: week.theme, anthropic_course: week.anthropic },
      };
      const [, sessionCreated] = await LiveSession.findOrCreate({
        where: { cohort_id: cohortId, session_number: s.session_number },
        defaults: sessionDefaults as any,
      });
      if (sessionCreated) {
        sessionsCreated++;
      } else {
        await LiveSession.update(
          {
            title: sessionDefaults.title,
            description: sessionDefaults.description,
            session_date: sessionDefaults.session_date,
            session_type: sessionDefaults.session_type,
            module_id: mod.id,
            skill_area: sessionDefaults.skill_area,
            presentation_phase_flag: sessionDefaults.presentation_phase_flag,
            curriculum_json: sessionDefaults.curriculum_json,
          } as any,
          { where: { cohort_id: cohortId, session_number: s.session_number } }
        );
      }
    }
  }

  console.log(
    `[canonical-course] "${course.program.name}" / "${cohort.name}" (${cohortId}): ` +
      `${modulesCreated} new modules, ${lessonsCreated} new lessons, ${sessionsCreated} new sessions ` +
      `(12 weeks / 4 intensives; re-runs are idempotent).`
  );
}

// Allow direct execution: `npx ts-node src/seeds/seedCanonicalCourse.ts`
if (require.main === module) {
  connectDatabase()
    .then(() => seedCanonicalCourse())
    .then(() => {
      console.log('[canonical-course] seeding complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[canonical-course] seeding failed:', err);
      process.exit(1);
    });
}
