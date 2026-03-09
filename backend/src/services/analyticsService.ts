import {
  LiveSession,
  Enrollment,
  LessonInstance,
  ArtifactDefinition,
  AssignmentSubmission,
  GitHubConnection,
  CurriculumLesson,
  CurriculumModule,
  SkillMastery,
  SkillDefinition,
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

// --- Program-wide analytics (not cohort-scoped) ---

export async function getProgramEnrollmentSummary() {
  const enrollments = await Enrollment.findAll();
  const byStatus: Record<string, number> = {};
  for (const e of enrollments) {
    const s = (e as any).status || 'unknown';
    byStatus[s] = (byStatus[s] || 0) + 1;
  }
  return { total: enrollments.length, byStatus };
}

export async function getProgramStudentProgress() {
  const enrollments = await Enrollment.findAll();
  const totalLessons = await CurriculumLesson.count();

  const results = [];
  for (const enrollment of enrollments) {
    const completedInstances = await LessonInstance.count({
      where: { enrollment_id: enrollment.id, status: 'completed' },
    });

    results.push({
      enrollment_id: enrollment.id,
      name: enrollment.full_name || enrollment.email,
      email: enrollment.email,
      company: (enrollment as any).company || '',
      status: (enrollment as any).status || 'unknown',
      lessonsCompleted: completedInstances,
      lessonsTotal: totalLessons,
      pct: totalLessons > 0 ? Math.round((completedInstances / totalLessons) * 100) : 0,
    });
  }

  return results;
}

export async function getProgramSkillMastery() {
  const skills = await SkillDefinition.findAll({ where: { is_active: true }, order: [['layer_id', 'ASC'], ['domain_id', 'ASC']] });
  const masteries = await SkillMastery.findAll();

  const masteryMap: Record<string, { total: number; sum: number }> = {};
  for (const m of masteries) {
    const sid = (m as any).skill_id;
    if (!masteryMap[sid]) masteryMap[sid] = { total: 0, sum: 0 };
    masteryMap[sid].total++;
    masteryMap[sid].sum += (m as any).proficiency_level || 0;
  }

  return skills.map(s => {
    const data = masteryMap[s.skill_id] || { total: 0, sum: 0 };
    return {
      skill_id: s.skill_id,
      name: s.name,
      layer_id: s.layer_id,
      domain_id: s.domain_id,
      studentsTracked: data.total,
      avgLevel: data.total > 0 ? Math.round((data.sum / data.total) * 10) / 10 : 0,
    };
  });
}

export async function getProgramArtifactTracker() {
  const artifacts = await ArtifactDefinition.findAll({ order: [['sort_order', 'ASC']] });
  const enrollments = await Enrollment.findAll({ where: { status: 'active' } });

  const students = [];
  for (const enrollment of enrollments) {
    const submissions: Record<string, boolean> = {};
    for (const artifact of artifacts) {
      const sub = await AssignmentSubmission.findOne({
        where: {
          enrollment_id: enrollment.id,
          artifact_definition_id: artifact.id,
          status: ['submitted', 'reviewed'],
        },
      });
      submissions[artifact.id] = !!sub;
    }

    students.push({
      enrollment_id: enrollment.id,
      name: enrollment.full_name || enrollment.email,
      email: enrollment.email,
      submissions,
    });
  }

  return {
    artifacts: artifacts.map(a => ({ id: a.id, name: a.name, artifact_type: (a as any).artifact_type })),
    students,
  };
}
