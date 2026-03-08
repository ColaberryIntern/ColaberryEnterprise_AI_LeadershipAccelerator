import {
  LiveSession,
  SessionGate,
  ArtifactDefinition,
  AssignmentSubmission,
  LessonInstance,
  CurriculumModule,
  CurriculumLesson,
  Enrollment,
  GitHubConnection,
} from '../models';
import { GateType } from '../models/SessionGate';
import * as artifactService from './artifactService';

export async function evaluateGate(
  enrollmentId: string,
  gate: any
): Promise<{ met: boolean; label: string; details?: string }> {
  const gateType: GateType = gate.gate_type;

  switch (gateType) {
    case 'module_completion': {
      if (!gate.module_id) return { met: false, label: 'Module completion (no module set)' };
      const lessons = await CurriculumLesson.findAll({ where: { module_id: gate.module_id } });
      const instances = await LessonInstance.findAll({
        where: {
          enrollment_id: enrollmentId,
          lesson_id: lessons.map(l => l.id),
        },
      });
      const allCompleted = lessons.length > 0 && instances.every(i => i.status === 'completed');
      return {
        met: allCompleted,
        label: `Complete all lessons in module`,
        details: `${instances.filter(i => i.status === 'completed').length}/${lessons.length} completed`,
      };
    }

    case 'lesson_completion': {
      if (!gate.lesson_id) return { met: false, label: 'Lesson completion (no lesson set)' };
      const instance = await LessonInstance.findOne({
        where: { enrollment_id: enrollmentId, lesson_id: gate.lesson_id },
      });
      return {
        met: instance?.status === 'completed',
        label: 'Complete required lesson',
        details: instance ? `Status: ${instance.status}` : 'Not started',
      };
    }

    case 'readiness_score': {
      const enrollment = await Enrollment.findByPk(enrollmentId);
      const score = enrollment?.readiness_score || 0;
      const required = gate.minimum_readiness_score || 0;
      return {
        met: score >= required,
        label: `Readiness score >= ${required}`,
        details: `Current: ${score}`,
      };
    }

    case 'artifact_completion': {
      const artifactIds = gate.required_artifact_ids || [];
      if (artifactIds.length === 0 && gate.artifact_definition_id) {
        artifactIds.push(gate.artifact_definition_id);
      }
      let completed = 0;
      for (const artId of artifactIds) {
        const isComplete = await artifactService.checkArtifactCompletion(enrollmentId, artId);
        if (isComplete) completed++;
      }
      return {
        met: completed === artifactIds.length,
        label: 'Required artifacts submitted',
        details: `${completed}/${artifactIds.length} artifacts complete`,
      };
    }

    case 'build_phase_unlock': {
      const result = await checkBuildPhaseUnlock(enrollmentId);
      return {
        met: result.unlocked,
        label: 'Build phase unlocked',
        details: result.reason,
      };
    }

    case 'presentation_unlock': {
      const result = await checkPresentationUnlock(enrollmentId);
      return {
        met: result.unlocked,
        label: 'Presentation phase unlocked',
        details: result.reason,
      };
    }

    case 'github_validation': {
      const connection = await GitHubConnection.findOne({
        where: { enrollment_id: enrollmentId },
      });
      return {
        met: !!connection?.repo_url,
        label: 'GitHub repository connected',
        details: connection?.repo_url || 'Not connected',
      };
    }

    default:
      return { met: false, label: `Unknown gate type: ${gateType}` };
  }
}

export async function checkBuildPhaseUnlock(
  enrollmentId: string
): Promise<{ unlocked: boolean; reason: string }> {
  // Find session 2 (or the session with build_phase_unlock flag)
  const enrollment = await Enrollment.findByPk(enrollmentId);
  if (!enrollment) return { unlocked: false, reason: 'Enrollment not found' };

  const buildSession = await LiveSession.findOne({
    where: { cohort_id: enrollment.cohort_id, build_phase_unlock: true },
  });

  if (!buildSession) {
    return { unlocked: true, reason: 'No build phase gate configured' };
  }

  // Check if the build session is completed
  if (buildSession.status !== 'completed') {
    return { unlocked: false, reason: `Session "${buildSession.title}" not yet completed` };
  }

  // Check required artifacts for build unlock
  const buildArtifacts = await artifactService.getBuildUnlockArtifacts();
  for (const artifact of buildArtifacts) {
    const isComplete = await artifactService.checkArtifactCompletion(enrollmentId, artifact.id);
    if (!isComplete) {
      return { unlocked: false, reason: `Required artifact "${artifact.name}" not submitted` };
    }
  }

  return { unlocked: true, reason: 'All build phase requirements met' };
}

export async function checkPresentationUnlock(
  enrollmentId: string
): Promise<{ unlocked: boolean; reason: string }> {
  // Check all presentation-required artifacts
  const presentationArtifacts = await artifactService.getPresentationUnlockArtifacts();

  for (const artifact of presentationArtifacts) {
    const isComplete = await artifactService.checkArtifactCompletion(enrollmentId, artifact.id);
    if (!isComplete) {
      return { unlocked: false, reason: `Required artifact "${artifact.name}" not submitted` };
    }
  }

  return { unlocked: true, reason: 'All presentation requirements met' };
}

export async function getSessionUnlockStatus(
  enrollmentId: string,
  sessionId: string
): Promise<{ ready: boolean; checklist: Array<{ gate_type: string; label: string; met: boolean; details?: string }> }> {
  const gates = await SessionGate.findAll({ where: { session_id: sessionId } });

  const checklist = [];
  let allMet = true;

  for (const gate of gates) {
    const result = await evaluateGate(enrollmentId, gate);
    checklist.push({
      gate_type: gate.gate_type,
      label: result.label,
      met: result.met,
      details: result.details,
    });
    if (!result.met) allMet = false;
  }

  return { ready: gates.length === 0 || allMet, checklist };
}

export async function simulateUserFlow(
  enrollmentId: string,
  cohortId: string
): Promise<any[]> {
  const sessions = await LiveSession.findAll({
    where: { cohort_id: cohortId },
    include: [{ model: SessionGate, as: 'gates' }],
    order: [['session_number', 'ASC']],
  });

  const flow = [];
  for (const session of sessions) {
    const status = await getSessionUnlockStatus(enrollmentId, session.id);
    flow.push({
      sessionId: session.id,
      sessionNumber: session.session_number,
      title: session.title,
      unlocked: status.ready,
      checklist: status.checklist,
    });
  }

  return flow;
}
