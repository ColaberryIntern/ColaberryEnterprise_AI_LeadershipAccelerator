import {
  LiveSession,
  CurriculumModule,
  SectionConfig,
  ArtifactDefinition,
  SessionGate,
  PromptTemplate,
  LessonInstance,
  Enrollment,
  AssignmentSubmission,
} from '../models';
import * as variableService from './variableService';
import * as artifactService from './artifactService';

export async function getSessionWithSections(sessionId: string): Promise<any> {
  const session = await LiveSession.findByPk(sessionId, {
    include: [
      { model: CurriculumModule, as: 'module' },
      {
        model: SectionConfig,
        as: 'sectionConfigs',
        include: [
          { model: PromptTemplate, as: 'suggestedPrompt' },
          { model: PromptTemplate, as: 'mentorPrompt' },
        ],
        order: [['section_order', 'ASC']],
      },
      {
        model: ArtifactDefinition,
        as: 'artifactDefinitions',
        order: [['sort_order', 'ASC']],
      },
      {
        model: SessionGate,
        as: 'gates',
      },
    ],
  });

  return session;
}

export async function getSessionFlow(cohortId: string): Promise<any[]> {
  const sessions = await LiveSession.findAll({
    where: { cohort_id: cohortId },
    include: [
      { model: CurriculumModule, as: 'module' },
      { model: ArtifactDefinition, as: 'artifactDefinitions' },
      { model: SessionGate, as: 'gates' },
    ],
    order: [['session_number', 'ASC']],
  });

  return sessions.map(s => ({
    id: s.id,
    session_number: s.session_number,
    title: s.title,
    session_type: s.session_type,
    status: s.status,
    build_phase_unlock: s.build_phase_unlock,
    presentation_phase_flag: s.presentation_phase_flag,
    required_prior_sessions: s.required_prior_sessions,
    module: (s as any).module,
    artifactCount: ((s as any).artifactDefinitions || []).length,
    gateCount: ((s as any).gates || []).length,
  }));
}

export async function getSessionFlowForEnrollment(
  cohortId: string,
  enrollmentId: string
): Promise<any[]> {
  const flow = await getSessionFlow(cohortId);

  for (const session of flow) {
    const artifactStatus = await artifactService.getArtifactStatus(enrollmentId, session.id);
    session.artifactsCompleted = artifactStatus.completedCount;
    session.artifactsTotal = artifactStatus.totalCount;

    // Check if all prior sessions are completed
    const priorIds = session.required_prior_sessions || [];
    if (priorIds.length > 0) {
      const priorSessions = await LiveSession.findAll({
        where: { id: priorIds },
      });
      session.priorSessionsMet = priorSessions.every(
        (ps: any) => ps.status === 'completed'
      );
    } else {
      session.priorSessionsMet = true;
    }
  }

  return flow;
}

export async function computeSectionStatus(
  enrollmentId: string,
  sectionId: string
): Promise<{ available: boolean; reasons: string[] }> {
  const section = await SectionConfig.findByPk(sectionId);
  if (!section) return { available: false, reasons: ['Section not found'] };

  const reasons: string[] = [];

  // Check if build phase flag requires build unlock
  if (section.build_phase_flag) {
    const enrollment = await Enrollment.findByPk(enrollmentId);
    if (!enrollment) {
      reasons.push('Enrollment not found');
    }
  }

  // Check if required variables exist
  const outputMap = section.variable_output_map || {};
  // Variable dependencies would be checked here if configured

  return {
    available: reasons.length === 0,
    reasons,
  };
}

export async function resolveVariablesForTemplate(
  enrollmentId: string,
  template: string
): Promise<string> {
  return variableService.resolveTemplate(enrollmentId, template);
}

export async function getOrchestrationDashboard(cohortId: string): Promise<any> {
  const sessions = await getSessionFlow(cohortId);

  const enrollments = await Enrollment.findAll({
    where: { cohort_id: cohortId, status: 'active' },
  });

  const totalSessions = sessions.length;
  const completedSessions = sessions.filter(s => s.status === 'completed').length;

  return {
    cohortId,
    totalSessions,
    completedSessions,
    activeEnrollments: enrollments.length,
    sessions,
  };
}
