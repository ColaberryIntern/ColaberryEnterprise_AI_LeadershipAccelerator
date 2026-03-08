import {
  LiveSession,
  Enrollment,
  LessonInstance,
  ArtifactDefinition,
  AssignmentSubmission,
  GitHubConnection,
  CurriculumLesson,
  CurriculumModule,
} from '../models';

export async function getSessionCompletionRates(cohortId: string) {
  const sessions = await LiveSession.findAll({
    where: { cohort_id: cohortId },
    order: [['session_number', 'ASC']],
  });

  const enrollments = await Enrollment.findAll({
    where: { cohort_id: cohortId, status: 'active' },
  });
  const totalEnrollments = enrollments.length;

  const rates = [];
  for (const session of sessions) {
    const moduleId = session.module_id;
    let completedCount = 0;

    if (moduleId) {
      const lessons = await CurriculumLesson.findAll({ where: { module_id: moduleId } });
      const lessonIds = lessons.map(l => l.id);

      for (const enrollment of enrollments) {
        const instances = await LessonInstance.findAll({
          where: { enrollment_id: enrollment.id, lesson_id: lessonIds },
        });
        const allDone = lessonIds.length > 0 && instances.every(i => i.status === 'completed');
        if (allDone) completedCount++;
      }
    }

    rates.push({
      session_id: session.id,
      session_number: session.session_number,
      title: session.title,
      total_enrollments: totalEnrollments,
      completed: completedCount,
      rate: totalEnrollments > 0 ? Math.round((completedCount / totalEnrollments) * 100) : 0,
    });
  }

  return rates;
}

export async function getArtifactCompletionMatrix(cohortId: string) {
  const enrollments = await Enrollment.findAll({
    where: { cohort_id: cohortId, status: 'active' },
  });

  const sessions = await LiveSession.findAll({
    where: { cohort_id: cohortId },
    order: [['session_number', 'ASC']],
  });

  const artifacts = await ArtifactDefinition.findAll({
    where: { session_id: sessions.map(s => s.id) },
    order: [['sort_order', 'ASC']],
  });

  const matrix = [];
  for (const enrollment of enrollments) {
    const row: Record<string, any> = {
      enrollment_id: enrollment.id,
      name: enrollment.full_name || enrollment.email,
      email: enrollment.email,
    };

    for (const artifact of artifacts) {
      const submission = await AssignmentSubmission.findOne({
        where: {
          enrollment_id: enrollment.id,
          artifact_definition_id: artifact.id,
          status: ['submitted', 'reviewed'],
        },
      });
      row[artifact.id] = !!submission;
    }

    matrix.push(row);
  }

  return {
    artifacts: artifacts.map(a => ({ id: a.id, name: a.name, session_id: a.session_id })),
    enrollments: matrix,
  };
}

export async function getBuildPhaseTracker(cohortId: string) {
  const enrollments = await Enrollment.findAll({
    where: { cohort_id: cohortId, status: 'active' },
  });

  const buildArtifacts = await ArtifactDefinition.findAll({
    where: { required_for_build_unlock: true },
  });

  const tracker = [];
  for (const enrollment of enrollments) {
    let completed = 0;
    for (const artifact of buildArtifacts) {
      const submission = await AssignmentSubmission.findOne({
        where: {
          enrollment_id: enrollment.id,
          artifact_definition_id: artifact.id,
          status: ['submitted', 'reviewed'],
        },
      });
      if (submission) completed++;
    }

    tracker.push({
      enrollment_id: enrollment.id,
      name: enrollment.full_name || enrollment.email,
      total_required: buildArtifacts.length,
      completed,
      unlocked: buildArtifacts.length > 0 ? completed === buildArtifacts.length : true,
    });
  }

  return tracker;
}

export async function getGitHubCommitSummary(cohortId: string) {
  const enrollments = await Enrollment.findAll({
    where: { cohort_id: cohortId, status: 'active' },
  });

  const summary = [];
  for (const enrollment of enrollments) {
    const connection = await GitHubConnection.findOne({
      where: { enrollment_id: enrollment.id },
    });

    summary.push({
      enrollment_id: enrollment.id,
      name: enrollment.full_name || enrollment.email,
      connected: !!connection,
      repo_url: connection?.repo_url || null,
      last_checked: connection?.last_checked_at || null,
      status: connection?.status_json || null,
    });
  }

  return summary;
}

export async function getPresentationReadiness(cohortId: string) {
  const enrollments = await Enrollment.findAll({
    where: { cohort_id: cohortId, status: 'active' },
  });

  const presentationArtifacts = await ArtifactDefinition.findAll({
    where: { required_for_presentation_unlock: true },
  });

  const readiness = [];
  for (const enrollment of enrollments) {
    let completed = 0;
    for (const artifact of presentationArtifacts) {
      const submission = await AssignmentSubmission.findOne({
        where: {
          enrollment_id: enrollment.id,
          artifact_definition_id: artifact.id,
          status: ['submitted', 'reviewed'],
        },
      });
      if (submission) completed++;
    }

    readiness.push({
      enrollment_id: enrollment.id,
      name: enrollment.full_name || enrollment.email,
      total_required: presentationArtifacts.length,
      completed,
      ready: presentationArtifacts.length > 0 ? completed === presentationArtifacts.length : true,
    });
  }

  return readiness;
}
