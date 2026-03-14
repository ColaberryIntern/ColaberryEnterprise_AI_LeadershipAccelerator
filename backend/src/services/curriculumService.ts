import CurriculumModule from '../models/CurriculumModule';
import CurriculumLesson from '../models/CurriculumLesson';
import LessonInstance from '../models/LessonInstance';
import UserCurriculumProfile from '../models/UserCurriculumProfile';
import SessionGate from '../models/SessionGate';
import { Enrollment, Cohort, SectionConfig, ArtifactDefinition, PromptTemplate, AssignmentSubmission } from '../models';
import MiniSection from '../models/MiniSection';
import { generateLessonContent } from './contentGenerationService';
import * as variableService from './variableService';
import * as artifactService from './artifactService';

/* ------------------------------------------------------------------ */
/*  Initialization                                                     */
/* ------------------------------------------------------------------ */

export async function initializeParticipantCurriculum(enrollmentId: string) {
  const enrollment = await Enrollment.findByPk(enrollmentId, {
    include: [{ model: Cohort, as: 'cohort' }],
  });
  if (!enrollment) throw new Error('Enrollment not found');

  const cohortId = enrollment.cohort_id;

  // Check if already initialized
  const existing = await LessonInstance.findOne({ where: { enrollment_id: enrollmentId } });
  if (existing) return; // Already initialized

  const modules = await CurriculumModule.findAll({
    where: { cohort_id: cohortId },
    order: [['module_number', 'ASC']],
    include: [{ model: CurriculumLesson, as: 'lessons', order: [['lesson_number', 'ASC']] } as any],
  });

  if (modules.length === 0) {
    console.warn(`[curriculumService] No curriculum modules found for cohort ${cohortId}. Ensure modules are linked to this cohort.`);
    throw new Error(`No curriculum modules found for cohort ${cohortId}. Ensure modules are linked.`);
  }

  for (const mod of modules) {
    const lessons = (mod as any).lessons || [];
    for (const lesson of lessons) {
      const isFirst = mod.module_number === 1 && lesson.lesson_number === 1;
      await LessonInstance.create({
        lesson_id: lesson.id,
        enrollment_id: enrollmentId,
        status: isFirst ? 'available' : 'locked',
        attempts: 0,
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Curriculum Profile                                                 */
/* ------------------------------------------------------------------ */

export async function getOrCreateCurriculumProfile(enrollmentId: string) {
  const enrollment = await Enrollment.findByPk(enrollmentId);
  if (!enrollment) throw new Error('Enrollment not found');

  let profile = await UserCurriculumProfile.findOne({ where: { enrollment_id: enrollmentId } });
  if (!profile) {
    profile = await UserCurriculumProfile.create({
      enrollment_id: enrollmentId,
      company_name: enrollment.company || undefined,
      company_size: enrollment.company_size || undefined,
      role: enrollment.title || undefined,
    });
  }
  return profile;
}

export async function updateCurriculumProfile(enrollmentId: string, data: Partial<UserCurriculumProfile>) {
  const profile = await getOrCreateCurriculumProfile(enrollmentId);
  await profile.update({
    ...data,
    updated_at: new Date(),
  });
  return profile;
}

/* ------------------------------------------------------------------ */
/*  Get Curriculum (full view)                                         */
/* ------------------------------------------------------------------ */

export async function getParticipantCurriculum(enrollmentId: string) {
  const enrollment = await Enrollment.findByPk(enrollmentId, {
    include: [{ model: Cohort, as: 'cohort' }],
  });
  if (!enrollment) throw new Error('Enrollment not found');

  // Initialize if needed
  await initializeParticipantCurriculum(enrollmentId);

  const modules = await CurriculumModule.findAll({
    where: { cohort_id: enrollment.cohort_id },
    order: [['module_number', 'ASC']],
    include: [{ model: CurriculumLesson, as: 'lessons' }],
  });

  // Get all lesson instances for this enrollment
  const instances = await LessonInstance.findAll({
    where: { enrollment_id: enrollmentId },
  });
  const instanceMap = new Map(instances.map((i) => [i.lesson_id, i]));

  let totalLessons = 0;
  let completedLessons = 0;
  let totalMinutes = 0;
  let completedMinutes = 0;

  const modulesWithProgress = modules.map((mod) => {
    const lessons = ((mod as any).lessons || [])
      .sort((a: any, b: any) => a.lesson_number - b.lesson_number);
    let modCompleted = 0;

    const lessonsWithStatus = lessons.map((lesson: CurriculumLesson) => {
      const instance = instanceMap.get(lesson.id);
      totalLessons++;
      totalMinutes += lesson.estimated_minutes;
      if (instance?.status === 'completed') {
        completedLessons++;
        completedMinutes += lesson.estimated_minutes;
        modCompleted++;
      }
      return {
        id: lesson.id,
        lesson_number: lesson.lesson_number,
        title: lesson.title,
        description: lesson.description,
        lesson_type: lesson.lesson_type,
        estimated_minutes: lesson.estimated_minutes,
        requires_structured_input: lesson.requires_structured_input,
        status: instance?.status || 'locked',
        instance_id: instance?.id || null,
        quiz_score: instance?.quiz_score ?? null,
        completed_at: instance?.completed_at || null,
      };
    });

    return {
      id: mod.id,
      module_number: mod.module_number,
      title: mod.title,
      description: mod.description,
      skill_area: mod.skill_area,
      total_lessons: mod.total_lessons,
      completed_lessons: modCompleted,
      status: modCompleted === 0
        ? 'not_started'
        : modCompleted === mod.total_lessons
          ? 'completed'
          : 'in_progress',
      lessons: lessonsWithStatus,
    };
  });

  return {
    enrollment_id: enrollmentId,
    cohort_name: (enrollment as any).cohort?.name || '',
    overall_progress: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0,
    total_lessons: totalLessons,
    completed_lessons: completedLessons,
    total_modules: modules.length,
    hours_remaining: Math.round((totalMinutes - completedMinutes) / 60 * 10) / 10,
    modules: modulesWithProgress,
  };
}

/* ------------------------------------------------------------------ */
/*  Module Detail                                                      */
/* ------------------------------------------------------------------ */

export async function getModuleDetail(enrollmentId: string, moduleId: string) {
  const mod = await CurriculumModule.findByPk(moduleId, {
    include: [{ model: CurriculumLesson, as: 'lessons' }],
  });
  if (!mod) throw new Error('Module not found');

  const instances = await LessonInstance.findAll({
    where: { enrollment_id: enrollmentId },
    include: [{ model: CurriculumLesson, as: 'lesson' }],
  });

  const lessonIds = ((mod as any).lessons || []).map((l: any) => l.id);
  const moduleInstances = instances.filter((i) => lessonIds.includes(i.lesson_id));

  return {
    module: mod,
    lessons: ((mod as any).lessons || [])
      .sort((a: any, b: any) => a.lesson_number - b.lesson_number)
      .map((lesson: any) => {
        const instance = moduleInstances.find((i) => i.lesson_id === lesson.id);
        return {
          ...lesson.toJSON(),
          status: instance?.status || 'locked',
          instance_id: instance?.id || null,
          quiz_score: instance?.quiz_score ?? null,
        };
      }),
  };
}

/* ------------------------------------------------------------------ */
/*  Start Lesson (generates content on demand)                         */
/* ------------------------------------------------------------------ */

export async function startLesson(enrollmentId: string, lessonId: string) {
  const lesson = await CurriculumLesson.findByPk(lessonId, {
    include: [{ model: CurriculumModule, as: 'module' }],
  });
  if (!lesson) throw new Error('Lesson not found');
  const mod = (lesson as any).module;

  let instance = await LessonInstance.findOne({
    where: { lesson_id: lessonId, enrollment_id: enrollmentId },
  });
  if (!instance) throw new Error('Lesson instance not found. Initialize curriculum first.');

  if (instance.status === 'locked') {
    throw new Error('This lesson is locked. Complete previous lessons first.');
  }

  // Mark as in_progress
  if (instance.status === 'available') {
    await instance.update({ status: 'in_progress', started_at: new Date() });
  }

  // Generate content if not cached
  if (!instance.generated_content_json) {
    const profile = await getOrCreateCurriculumProfile(enrollmentId);

    // Gather prior lab responses for context
    const priorLabResponses = await getPriorLabResponses(enrollmentId, lessonId);

    let content: any;
    try {
      content = await generateLessonContent(lesson, profile, priorLabResponses, enrollmentId);
    } catch (genErr: any) {
      console.error(`[curriculumService] Content generation failed for lesson ${lessonId}:`, genErr.message);
      content = {
        concept_snapshot: {
          title: lesson.title,
          sections: [{
            heading: 'Content Temporarily Unavailable',
            content: 'AI content generation is temporarily unavailable. Please try again in a few minutes. If the problem persists, contact your program administrator.',
          }],
        },
        generation_error: true,
        error_message: genErr.message,
      };
    }

    // Merge admin-defined artifacts if SectionConfig exists for this lesson
    if (content.implementation_task) {
      const sectionConfig = await SectionConfig.findOne({ where: { lesson_id: lessonId } });
      if (sectionConfig) {
        const adminArtifacts = await ArtifactDefinition.findAll({
          where: { section_id: sectionConfig.id },
          order: [['sort_order', 'ASC']],
        });
        if (adminArtifacts.length > 0) {
          content.implementation_task.required_artifacts = adminArtifacts.map((a: any) => ({
            name: a.name,
            description: a.description,
            file_types: a.file_types || ['.pdf', '.docx', '.png', '.jpg'],
            validation_criteria: a.evaluation_criteria || '',
            allow_screenshot: a.requires_screenshot || false,
            artifact_definition_id: a.id,
          }));
        }
      }
    }

    await instance.update({ generated_content_json: content });
    instance = await LessonInstance.findByPk(instance.id) as LessonInstance;
  }

  return {
    lesson: {
      id: lesson.id,
      lesson_number: lesson.lesson_number,
      title: lesson.title,
      description: lesson.description,
      lesson_type: lesson.lesson_type,
      estimated_minutes: lesson.estimated_minutes,
      requires_structured_input: lesson.requires_structured_input,
      structured_fields_schema: lesson.structured_fields_schema,
    },
    module: mod ? {
      id: mod.id,
      title: mod.title,
      module_number: mod.module_number,
    } : null,
    instance: {
      id: instance.id,
      status: instance.status,
      generated_content_json: instance.generated_content_json,
      structured_responses_json: instance.structured_responses_json,
      reflection_responses_json: instance.reflection_responses_json,
      quiz_score: instance.quiz_score,
      quiz_responses_json: instance.quiz_responses_json,
      attempts: instance.attempts,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Complete Lesson                                                    */
/* ------------------------------------------------------------------ */

export async function completeLesson(
  enrollmentId: string,
  lessonId: string,
  payload: {
    quiz_responses?: any;
    quiz_score?: number;
    reflection_responses?: any;
  }
) {
  const lesson = await CurriculumLesson.findByPk(lessonId, {
    include: [{ model: CurriculumModule, as: 'module' }],
  });
  if (!lesson) throw new Error('Lesson not found');

  const instance = await LessonInstance.findOne({
    where: { lesson_id: lessonId, enrollment_id: enrollmentId },
  });
  if (!instance) throw new Error('Lesson instance not found');

  if (instance.status === 'locked') throw new Error('Lesson is locked');
  if (instance.status === 'completed') return { already_completed: true };

  // Validate completion requirements (unified section model)
  const reqs = lesson.completion_requirements || {};
  const quizPassScore = reqs.quiz_pass_score ?? (lesson.lesson_type === 'assessment' ? 70 : null);

  if (quizPassScore && payload.quiz_score != null) {
    if (payload.quiz_score < quizPassScore) {
      await instance.update({
        quiz_score: payload.quiz_score,
        quiz_responses_json: payload.quiz_responses,
        attempts: instance.attempts + 1,
      });
      return { passed: false, score: payload.quiz_score, message: `Score below ${quizPassScore}%. Please retry.` };
    }
    await instance.update({
      quiz_score: payload.quiz_score,
      quiz_responses_json: payload.quiz_responses,
    });
  } else if (payload.quiz_score != null) {
    // Save quiz score even when no pass threshold is set
    await instance.update({
      quiz_score: payload.quiz_score,
      quiz_responses_json: payload.quiz_responses,
    });
  }

  // Save reflection responses
  if (payload.reflection_responses) {
    await instance.update({ reflection_responses_json: payload.reflection_responses });
  }

  // Mark complete
  await instance.update({ status: 'completed', completed_at: new Date() });

  // Unlock next lesson
  await unlockNextLesson(enrollmentId, lesson);

  // Find the next available lesson for navigation
  const nextInstance = await LessonInstance.findOne({
    where: { enrollment_id: enrollmentId, status: 'available' },
    include: [{ model: CurriculumLesson, as: 'lesson' }],
  });
  const nextLesson = nextInstance ? {
    id: (nextInstance as any).lesson?.id,
    title: (nextInstance as any).lesson?.title,
  } : null;

  return { passed: true, score: payload.quiz_score, next_lesson: nextLesson };
}

/* ------------------------------------------------------------------ */
/*  Submit Lab Data                                                    */
/* ------------------------------------------------------------------ */

export async function submitLabData(
  enrollmentId: string,
  lessonId: string,
  structuredData: Record<string, any>
) {
  const lesson = await CurriculumLesson.findByPk(lessonId);
  if (!lesson) throw new Error('Lesson not found');
  if (!lesson.requires_structured_input) throw new Error('This lesson does not accept structured input');

  const instance = await LessonInstance.findOne({
    where: { lesson_id: lessonId, enrollment_id: enrollmentId },
  });
  if (!instance) throw new Error('Lesson instance not found');

  // Validate required fields
  const schema = lesson.structured_fields_schema as any;
  if (schema?.fields) {
    for (const field of schema.fields) {
      if (field.required && (!structuredData[field.name] || structuredData[field.name].toString().trim() === '')) {
        throw new Error(`Required field missing: ${field.label}`);
      }
    }
  }

  await instance.update({ structured_responses_json: structuredData });

  return { saved: true };
}

/* ------------------------------------------------------------------ */
/*  Session Readiness Check                                            */
/* ------------------------------------------------------------------ */

export async function checkSessionReadiness(enrollmentId: string, sessionId: string) {
  const gates = await SessionGate.findAll({
    where: { session_id: sessionId },
    include: [
      { model: CurriculumModule, as: 'module' },
      { model: CurriculumLesson, as: 'lesson' },
    ],
  });

  if (gates.length === 0) {
    return { ready: true, checklist: [], message: 'No requirements configured' };
  }

  const enrollment = await Enrollment.findByPk(enrollmentId);
  if (!enrollment) throw new Error('Enrollment not found');

  const instances = await LessonInstance.findAll({
    where: { enrollment_id: enrollmentId },
  });

  const checklist = [];
  let allMet = true;

  for (const gate of gates) {
    let met = false;
    let label = '';

    if (gate.gate_type === 'module_completion' && gate.module_id) {
      const modLessons = await CurriculumLesson.findAll({ where: { module_id: gate.module_id } });
      const modLessonIds = modLessons.map((l) => l.id);
      const completed = instances.filter(
        (i) => modLessonIds.includes(i.lesson_id) && i.status === 'completed'
      );
      met = completed.length === modLessons.length;
      label = `Complete Module: ${(gate as any).module?.title || gate.module_id}`;
    } else if (gate.gate_type === 'lesson_completion' && gate.lesson_id) {
      const inst = instances.find((i) => i.lesson_id === gate.lesson_id);
      met = inst?.status === 'completed';
      label = `Complete Lesson: ${(gate as any).lesson?.title || gate.lesson_id}`;
    } else if (gate.gate_type === 'readiness_score' && gate.minimum_readiness_score != null) {
      met = (enrollment.readiness_score || 0) >= gate.minimum_readiness_score;
      label = `Readiness Score ≥ ${gate.minimum_readiness_score}%`;
    } else if (gate.gate_type === 'artifact_completion' && gate.artifact_definition_id) {
      const submission = await AssignmentSubmission.findOne({
        where: { enrollment_id: enrollmentId, artifact_definition_id: gate.artifact_definition_id, status: 'submitted' },
      });
      met = !!submission;
      label = `Submit required artifact: ${gate.artifact_definition_id}`;
    }

    if (!met) allMet = false;
    checklist.push({ gate_type: gate.gate_type, label, met });
  }

  return { ready: allMet, checklist };
}

/* ------------------------------------------------------------------ */
/*  Admin: Override lesson status                                      */
/* ------------------------------------------------------------------ */

export async function overrideLessonStatus(
  enrollmentId: string,
  lessonId: string,
  status: 'locked' | 'available' | 'in_progress' | 'completed'
) {
  const instance = await LessonInstance.findOne({
    where: { lesson_id: lessonId, enrollment_id: enrollmentId },
  });
  if (!instance) throw new Error('Lesson instance not found');

  await instance.update({
    status,
    ...(status === 'completed' ? { completed_at: new Date() } : {}),
  });

  return instance;
}

/* ------------------------------------------------------------------ */
/*  Admin: View lab responses                                          */
/* ------------------------------------------------------------------ */

export async function getLabResponses(enrollmentId: string) {
  const instances = await LessonInstance.findAll({
    where: { enrollment_id: enrollmentId },
    include: [{ model: CurriculumLesson, as: 'lesson' }],
  });

  return instances
    .filter((i) => i.structured_responses_json)
    .map((i) => ({
      lesson_id: i.lesson_id,
      lesson_title: (i as any).lesson?.title || '',
      lesson_type: (i as any).lesson?.lesson_type || '',
      structured_responses: i.structured_responses_json,
      completed_at: i.completed_at,
    }));
}

/* ------------------------------------------------------------------ */
/*  Admin: Get modules for cohort                                      */
/* ------------------------------------------------------------------ */

export async function getModulesForCohort(cohortId: string) {
  const modules = await CurriculumModule.findAll({
    where: { cohort_id: cohortId },
    order: [
      ['module_number', 'ASC'],
      [{ model: CurriculumLesson, as: 'lessons' }, 'lesson_number', 'ASC'],
    ],
    include: [
      {
        model: CurriculumLesson,
        as: 'lessons',
        attributes: ['id', 'lesson_number', 'title', 'lesson_type', 'estimated_minutes', 'requires_structured_input'],
      },
    ],
  });

  return modules.map((mod) => {
    const plain = mod.toJSON() as any;
    return { ...plain, total_lessons: plain.lessons?.length ?? 0 };
  });
}

/* ------------------------------------------------------------------ */
/*  Save Quiz Progress (per-question auto-save)                        */
/* ------------------------------------------------------------------ */

export async function saveQuizProgress(
  enrollmentId: string,
  lessonId: string,
  responses: Record<string, any>
) {
  const instance = await LessonInstance.findOne({
    where: { lesson_id: lessonId, enrollment_id: enrollmentId },
  });
  if (!instance) throw new Error('Lesson instance not found');

  const existing = (instance.quiz_responses_json as Record<string, any>) || {};
  const merged = { ...existing, ...responses };

  await instance.update({ quiz_responses_json: merged });

  return { saved: true };
}

/* ------------------------------------------------------------------ */
/*  Save Task Progress (implementation task mid-lesson save)            */
/* ------------------------------------------------------------------ */

export async function saveTaskProgress(
  enrollmentId: string,
  lessonId: string,
  taskData: Record<string, any>
) {
  const instance = await LessonInstance.findOne({
    where: { lesson_id: lessonId, enrollment_id: enrollmentId },
  });
  if (!instance) throw new Error('Lesson instance not found');

  const existing = (instance.structured_responses_json as Record<string, any>) || {};
  const merged = { ...existing, task_progress: taskData };

  await instance.update({ structured_responses_json: merged });

  return { saved: true };
}

/* ------------------------------------------------------------------ */
/*  Grade Artifacts (AI-powered review)                                */
/* ------------------------------------------------------------------ */

export async function gradeArtifacts(
  enrollmentId: string,
  lessonId: string,
  artifacts: Array<{
    name: string;
    submission_id: string;
    file_name: string;
    file_type: string;
    validation_criteria: string;
    is_screenshot?: boolean;
    artifact_definition_id?: string;
  }>
) {
  const instance = await LessonInstance.findOne({
    where: { lesson_id: lessonId, enrollment_id: enrollmentId },
  });
  if (!instance) throw new Error('Lesson instance not found');

  const { default: OpenAI } = await import('openai');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const gradingResults: Array<{
    name: string;
    submission_id: string;
    passed: boolean;
    feedback: string;
    strengths: string[];
    missing_items: string[];
  }> = [];

  const fs = await import('fs');
  const pathMod = await import('path');

  for (const artifact of artifacts) {
    // Read actual file content from uploaded submission
    let fileContent = '';
    try {
      const submission = await AssignmentSubmission.findByPk(artifact.submission_id);
      if (submission?.file_path) {
        const ext = pathMod.extname(submission.file_path).toLowerCase();
        if (['.txt', '.md', '.py', '.js', '.ts', '.java', '.csv', '.json', '.xml', '.html', '.css'].includes(ext)) {
          fileContent = fs.readFileSync(submission.file_path, 'utf-8').substring(0, 10000);
        }
      }
    } catch { /* ignore read errors */ }

    const contentSection = fileContent
      ? `\nFILE CONTENT:\n${fileContent}\n`
      : '';

    const prompt = artifact.is_screenshot
      ? `You are grading a screenshot proof of a completed task.
Artifact: "${artifact.name}"
File: ${artifact.file_name}
Validation criteria: ${artifact.validation_criteria}

Since this is an image file, grade based on whether the file type is appropriate for a screenshot proof. Provide guidance on what should be visible in the screenshot.

Respond in JSON: { "passed": true/false, "feedback": "...", "strengths": ["..."], "missing_items": ["..."] }`
      : `You are grading a submitted artifact for an enterprise AI training program.
Artifact: "${artifact.name}"
File: ${artifact.file_name} (${artifact.file_type})
Validation criteria: ${artifact.validation_criteria}
${contentSection}
Grade this submission against the validation criteria. Be encouraging but rigorous.
- Check if all requirements in the validation criteria are addressed
- A score of "passed" means the learner demonstrated adequate understanding
- If the content is a simulated/placeholder submission, mark as not passed

Respond in JSON: { "passed": true/false, "feedback": "2-3 sentence assessment", "strengths": ["..."], "missing_items": ["..."] }`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 1000,
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      gradingResults.push({
        name: artifact.name,
        submission_id: artifact.submission_id,
        passed: result.passed ?? false,
        feedback: result.feedback || 'Submission received.',
        strengths: result.strengths || [],
        missing_items: result.missing_items || [],
      });
    } catch {
      gradingResults.push({
        name: artifact.name,
        submission_id: artifact.submission_id,
        passed: false,
        feedback: 'Auto-grading unavailable. Please resubmit or contact support.',
        strengths: [],
        missing_items: ['Unable to grade automatically'],
      });
    }
  }

  // Link submissions to ArtifactDefinitions and store variables on pass
  for (const artifact of artifacts) {
    if (artifact.artifact_definition_id && artifact.submission_id) {
      try {
        await AssignmentSubmission.update(
          { artifact_definition_id: artifact.artifact_definition_id },
          { where: { id: artifact.submission_id } }
        );
        const result = gradingResults.find(r => r.submission_id === artifact.submission_id);
        if (result?.passed) {
          await artifactService.onArtifactSubmitted(
            enrollmentId,
            artifact.artifact_definition_id,
            `Graded: ${result.feedback}`
          );
        }
      } catch {
        // Non-critical — log and continue
      }
    }
  }

  // Save grading results
  const existing = (instance.structured_responses_json as Record<string, any>) || {};
  await instance.update({
    structured_responses_json: {
      ...existing,
      task_progress: {
        ...(existing.task_progress || {}),
        grading: gradingResults,
        graded_at: new Date().toISOString(),
      },
    },
  });

  // Store grading result as variable for downstream prompts
  const allPassed = gradingResults.every(r => r.passed);
  try {
    await variableService.setVariable(
      enrollmentId,
      `lesson_${lessonId}_grading`,
      JSON.stringify({ all_passed: allPassed, results: gradingResults }),
      'session'
    );
  } catch {
    // Non-critical
  }

  return { grading: gradingResults, all_passed: allPassed };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function unlockNextLesson(enrollmentId: string, currentLesson: CurriculumLesson) {
  const mod = await CurriculumModule.findByPk(currentLesson.module_id, {
    include: [{ model: CurriculumLesson, as: 'lessons' }],
  });
  if (!mod) return;

  const lessons = ((mod as any).lessons || []).sort(
    (a: any, b: any) => a.lesson_number - b.lesson_number
  );

  const currentIndex = lessons.findIndex((l: any) => l.id === currentLesson.id);

  if (currentIndex === -1) {
    console.warn(`[curriculumService] Lesson ${currentLesson.id} not found in module ${mod.id}. Cannot unlock next lesson.`);
    return;
  }

  // If there's a next lesson in this module, unlock it
  if (currentIndex < lessons.length - 1) {
    const nextLesson = lessons[currentIndex + 1];
    const nextInstance = await LessonInstance.findOne({
      where: { lesson_id: nextLesson.id, enrollment_id: enrollmentId },
    });
    if (nextInstance && nextInstance.status === 'locked') {
      await nextInstance.update({ status: 'available' });
    }
    return;
  }

  // If this was the last lesson in the module, check if all are completed
  const allInstances = await LessonInstance.findAll({ where: { enrollment_id: enrollmentId } });
  const modLessonIds = lessons.map((l: any) => l.id);
  const allCompleted = modLessonIds.every((lid: string) => {
    const inst = allInstances.find((i) => i.lesson_id === lid);
    return inst?.status === 'completed';
  });

  if (allCompleted) {
    // Unlock first lesson of next module
    const nextMod = await CurriculumModule.findOne({
      where: { cohort_id: mod.cohort_id, module_number: mod.module_number + 1 },
      include: [{ model: CurriculumLesson, as: 'lessons' }],
    });
    if (nextMod) {
      const nextModLessons = ((nextMod as any).lessons || []).sort(
        (a: any, b: any) => a.lesson_number - b.lesson_number
      );
      if (nextModLessons.length > 0) {
        const firstInst = await LessonInstance.findOne({
          where: { lesson_id: nextModLessons[0].id, enrollment_id: enrollmentId },
        });
        if (firstInst && firstInst.status === 'locked') {
          await firstInst.update({ status: 'available' });
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Orchestration Context (for frontend Integration)                   */
/* ------------------------------------------------------------------ */

export async function getOrchestrationContext(enrollmentId: string, lessonId: string) {
  const sectionConfig = await SectionConfig.findOne({
    where: { lesson_id: lessonId },
    include: [
      { model: PromptTemplate, as: 'suggestedPrompt' },
      { model: PromptTemplate, as: 'mentorPrompt' },
    ],
  });

  if (!sectionConfig) {
    return {
      sectionConfig: null,
      artifactDefinitions: [],
      mentorPromptTemplate: null,
      resolvedVariables: {},
    };
  }

  const artifactDefinitions = await ArtifactDefinition.findAll({
    where: { section_id: sectionConfig.id },
    order: [['sort_order', 'ASC']],
  });

  // Resolve mentor prompt template with variables
  let mentorPromptTemplate: { system_prompt: string; user_prompt_template: string } | null = null;
  const mentorPrompt = (sectionConfig as any).mentorPrompt as PromptTemplate | null;
  if (mentorPrompt) {
    const resolvedSystem = await variableService.resolveTemplate(enrollmentId, mentorPrompt.system_prompt || '');
    const resolvedUser = await variableService.resolveTemplate(enrollmentId, mentorPrompt.user_prompt_template || '');
    mentorPromptTemplate = { system_prompt: resolvedSystem, user_prompt_template: resolvedUser };
  }

  const resolvedVariables = await variableService.getAllVariables(enrollmentId);

  // Inject section system variables (section_title, section_description, section_learning_goal)
  const sectionSystemVars = await variableService.getSectionSystemVariables(lessonId);
  Object.assign(resolvedVariables, sectionSystemVars);

  // Load global AI Workstation prompt from system settings
  const { getSetting } = await import('./settingsService');
  const globalPromptRaw = await getSetting('workstation_prompt');
  let workstationPrompt: string | null = null;
  if (globalPromptRaw) {
    workstationPrompt = await variableService.resolveTemplate(enrollmentId, globalPromptRaw);
  }
  const workstationTestMode = await getSetting('workstation_test_mode') || false;

  return {
    sectionConfig: {
      id: sectionConfig.id,
      build_phase_flag: sectionConfig.build_phase_flag,
      github_required_flag: sectionConfig.github_required_flag,
      notebooklm_required: sectionConfig.notebooklm_required,
      notebooklm_instructions: sectionConfig.notebooklm_instructions,
      implementation_task_text: sectionConfig.implementation_task_text,
    },
    artifactDefinitions: artifactDefinitions.map((a: any) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      artifact_type: a.artifact_type,
      file_types: a.file_types,
      evaluation_criteria: a.evaluation_criteria,
      requires_screenshot: a.requires_screenshot,
      required_for_session: a.required_for_session,
      required_for_build_unlock: a.required_for_build_unlock,
      required_for_presentation_unlock: a.required_for_presentation_unlock,
    })),
    mentorPromptTemplate,
    workstationPrompt,
    workstationTestMode,
    resolvedVariables,
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function getPriorLabResponses(enrollmentId: string, currentLessonId: string) {
  const currentLesson = await CurriculumLesson.findByPk(currentLessonId, {
    include: [{ model: CurriculumModule, as: 'module' }],
  });
  if (!currentLesson) return {};

  const instances = await LessonInstance.findAll({
    where: { enrollment_id: enrollmentId },
    include: [{
      model: CurriculumLesson,
      as: 'lesson',
      include: [{ model: CurriculumModule, as: 'module' }],
    }],
  });

  const labResponses: Record<string, any> = {};
  for (const inst of instances) {
    if (inst.structured_responses_json) {
      const lesson = (inst as any).lesson;
      if (lesson && (lesson as any).module?.module_number < (currentLesson as any).module?.module_number) {
        labResponses[lesson.title] = inst.structured_responses_json;
      }
    }
  }

  return labResponses;
}
