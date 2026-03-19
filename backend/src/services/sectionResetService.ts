/**
 * Section Reset Service
 *
 * Safely resets all learning/execution state for a specific lesson + enrollment
 * so the portal behaves like a fresh first-time run. Only deletes student data —
 * never touches curriculum structure (MiniSection, CurriculumLesson, etc.).
 */

import { Op } from 'sequelize';
import {
  Enrollment, CurriculumLesson, MiniSection, LessonInstance,
  SectionExecutionLog, ContentGenerationLog, VariableStore,
  AssignmentSubmission, ArtifactDefinition,
} from '../models';
import { logAiEvent } from './aiEventService';

// ─── Types ──────────────────────────────────────────────────────────

export interface ResetResult {
  success: boolean;
  enrollment_id: string;
  lesson_id: string;
  lesson_title: string;
  deleted: {
    execution_logs: number;
    generation_logs: number;
    variables: number;
    variable_keys: string[];
    artifacts: number;
  };
  lesson_instance_reset: boolean;
  audit_event_id: string;
}

// ─── Reset Function ─────────────────────────────────────────────────

export async function resetSectionForEnrollment(
  lessonId: string,
  userEmail: string,
): Promise<ResetResult> {
  // 1. Resolve enrollment
  const enrollment = await Enrollment.findOne({ where: { email: userEmail } });
  if (!enrollment) {
    throw new Error(`Enrollment not found for email: ${userEmail}`);
  }
  const enrollmentId = enrollment.id;

  // 2. Verify lesson exists
  const lesson = await CurriculumLesson.findByPk(lessonId);
  if (!lesson) {
    throw new Error(`Lesson not found: ${lessonId}`);
  }

  // 3. Get variable keys created by this lesson's mini-sections
  const miniSections = await MiniSection.findAll({
    where: { lesson_id: lessonId },
    attributes: ['creates_variable_keys'],
  });
  const variableKeys = [
    ...new Set(
      miniSections.flatMap((ms: any) => ms.creates_variable_keys || [])
    ),
  ];

  // 4. Get artifact definition IDs for this lesson
  const artifactDefs = await ArtifactDefinition.findAll({
    where: { lesson_id: lessonId },
    attributes: ['id'],
  });
  const artifactDefIds = artifactDefs.map((a: any) => a.id);

  // 5. Delete scoped data (sequential, each independent)
  const deletedExecutionLogs = await SectionExecutionLog.destroy({
    where: { lesson_id: lessonId, enrollment_id: enrollmentId },
  });

  const deletedGenerationLogs = await ContentGenerationLog.destroy({
    where: { lesson_id: lessonId, enrollment_id: enrollmentId },
  });

  let deletedVariables = 0;
  if (variableKeys.length > 0) {
    deletedVariables = await VariableStore.destroy({
      where: {
        enrollment_id: enrollmentId,
        variable_key: { [Op.in]: variableKeys },
      },
    });
  }

  let deletedArtifacts = 0;
  if (artifactDefIds.length > 0) {
    deletedArtifacts = await AssignmentSubmission.destroy({
      where: {
        enrollment_id: enrollmentId,
        artifact_definition_id: { [Op.in]: artifactDefIds },
      },
    });
  }

  // 6. Reset LessonInstance (clear generated content, reset status)
  const [instancesUpdated] = await LessonInstance.update(
    {
      status: 'available',
      generated_content_json: null,
      structured_responses_json: null,
      reflection_responses_json: null,
      quiz_score: null,
      quiz_responses_json: null,
      attempts: 0,
      started_at: null,
      completed_at: null,
    } as any,
    { where: { lesson_id: lessonId, enrollment_id: enrollmentId } },
  );

  // 7. Log audit event
  const auditDetails = {
    enrollment_id: enrollmentId,
    user_email: userEmail,
    lesson_title: lesson.title,
    deleted_execution_logs: deletedExecutionLogs,
    deleted_generation_logs: deletedGenerationLogs,
    deleted_variables: deletedVariables,
    deleted_variable_keys: variableKeys,
    deleted_artifacts: deletedArtifacts,
    lesson_instance_reset: instancesUpdated > 0,
  };

  const auditEvent = await logAiEvent(
    'section-reset',
    'SECTION_RESET',
    'curriculum',
    lessonId,
    auditDetails,
  );

  return {
    success: true,
    enrollment_id: enrollmentId,
    lesson_id: lessonId,
    lesson_title: lesson.title,
    deleted: {
      execution_logs: deletedExecutionLogs,
      generation_logs: deletedGenerationLogs,
      variables: deletedVariables,
      variable_keys: variableKeys,
      artifacts: deletedArtifacts,
    },
    lesson_instance_reset: instancesUpdated > 0,
    audit_event_id: (auditEvent as any)?.id || 'logged',
  };
}
