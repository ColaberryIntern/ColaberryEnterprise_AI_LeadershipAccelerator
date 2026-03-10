import { Op } from 'sequelize';
import { Enrollment, LessonInstance, ArtifactDefinition, AssignmentSubmission, SessionGate } from '../../models';
import { logAiEvent } from '../aiEventService';
import type { AgentExecutionResult, AgentAction } from './types';

const AGENT_NAME = 'StudentProgressMonitor';
const STUCK_THRESHOLD_HOURS = 48;

export async function runStudentProgressMonitor(
  agentId: string,
  _config: Record<string, any> = {},
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    // 1. Find active enrollments
    const activeEnrollments = await Enrollment.findAll({
      where: { status: 'active' },
      attributes: ['id'],
    });

    if (activeEnrollments.length === 0) {
      return {
        agent_name: AGENT_NAME,
        campaigns_processed: 0,
        actions_taken: [],
        errors: [],
        duration_ms: Date.now() - startTime,
      };
    }

    const enrollmentIds = activeEnrollments.map((e: any) => e.id);
    const stuckThreshold = new Date(Date.now() - STUCK_THRESHOLD_HOURS * 60 * 60 * 1000);

    // 2. Detect stuck students: in_progress lessons older than threshold
    const stuckInstances = await LessonInstance.findAll({
      where: {
        enrollment_id: { [Op.in]: enrollmentIds },
        status: 'in_progress',
        started_at: { [Op.lt]: stuckThreshold },
        completed_at: { [Op.is]: null } as any,
      },
      attributes: ['id', 'enrollment_id', 'lesson_id', 'started_at'],
    });

    for (const instance of stuckInstances) {
      const finding = {
        enrollment_id: (instance as any).enrollment_id,
        lesson_id: (instance as any).lesson_id,
        started_at: (instance as any).started_at,
        hours_stuck: Math.round((Date.now() - new Date((instance as any).started_at).getTime()) / (60 * 60 * 1000)),
      };

      await logAiEvent(
        'student_progress_monitor',
        'stuck_student',
        'enrollment',
        (instance as any).enrollment_id,
        finding,
      );

      actions.push({
        campaign_id: 'orchestration',
        action: 'stuck_student_detected',
        reason: `Enrollment ${(instance as any).enrollment_id} stuck on lesson for ${finding.hours_stuck}h`,
        confidence: 1.0,
        before_state: null,
        after_state: finding,
        result: 'success',
      });
    }

    // 3. Detect missing required artifacts
    const buildUnlockArtifacts = await ArtifactDefinition.findAll({
      where: { required_for_build_unlock: true },
      attributes: ['id', 'name'],
    });

    if (buildUnlockArtifacts.length > 0) {
      const artifactIds = buildUnlockArtifacts.map((a: any) => a.id);

      for (const enrollmentId of enrollmentIds) {
        const submissions = await AssignmentSubmission.findAll({
          where: {
            enrollment_id: enrollmentId,
            artifact_definition_id: { [Op.in]: artifactIds },
          },
          attributes: ['artifact_definition_id'],
        });

        const submittedIds = new Set(submissions.map((s: any) => s.artifact_definition_id));
        const missing = buildUnlockArtifacts.filter((a: any) => !submittedIds.has(a.id));

        if (missing.length > 0) {
          await logAiEvent(
            'student_progress_monitor',
            'missing_required_artifacts',
            'enrollment',
            enrollmentId,
            {
              missing_count: missing.length,
              missing_artifacts: missing.map((a: any) => a.name),
            },
          );

          actions.push({
            campaign_id: 'orchestration',
            action: 'missing_artifacts_detected',
            reason: `Enrollment ${enrollmentId} missing ${missing.length} required artifact(s)`,
            confidence: 1.0,
            before_state: null,
            after_state: { missing_artifacts: missing.map((a: any) => a.name) },
            result: 'success',
          });
        }
      }
    }

    // 4. Detect gating deadlocks: lesson_completion gates where prerequisite lessons are completed
    //    but no enrolled students have progressed past the gated session
    const lessonGates = await SessionGate.findAll({
      where: { gate_type: 'lesson_completion', lesson_id: { [Op.ne]: null } } as any,
      attributes: ['id', 'session_id', 'lesson_id', 'gate_type'],
    });

    for (const gate of lessonGates) {
      const completedCount = await LessonInstance.count({
        where: {
          lesson_id: (gate as any).lesson_id,
          status: 'completed',
        },
      });

      if (completedCount > 0) {
        await logAiEvent(
          'student_progress_monitor',
          'gating_checkpoint',
          'session_gate',
          (gate as any).id,
          {
            session_id: (gate as any).session_id,
            lesson_id: (gate as any).lesson_id,
            completed_by_students: completedCount,
          },
        );

        actions.push({
          campaign_id: 'orchestration',
          action: 'gating_checkpoint_detected',
          reason: `Gate ${(gate as any).id}: ${completedCount} student(s) completed prerequisite lesson`,
          confidence: 0.9,
          before_state: null,
          after_state: { gate_id: (gate as any).id, completed_count: completedCount },
          result: 'success',
        });
      }
    }

    return {
      agent_name: AGENT_NAME,
      campaigns_processed: activeEnrollments.length,
      actions_taken: actions,
      errors,
      duration_ms: Date.now() - startTime,
    };
  } catch (err: any) {
    errors.push(`${AGENT_NAME} failed: ${err.message}`);
    return {
      agent_name: AGENT_NAME,
      campaigns_processed: 0,
      actions_taken: actions,
      errors,
      duration_ms: Date.now() - startTime,
    };
  }
}
