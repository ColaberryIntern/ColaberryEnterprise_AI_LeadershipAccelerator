import GitHubConnection from '../../models/GitHubConnection';
import StudentTask from '../../models/StudentTask';
import { getProjectByEnrollment } from '../projectService';
import { ProjectProgressValue, SnapshotField } from './types';

/**
 * Reuses getProjectByEnrollment() (projectService.ts) rather than a raw
 * query — that function already resolves the real active/non-archived
 * project correctly, a genuine edge case the discovery report flagged
 * (a stale active_project_id pointer must not resurrect an archived
 * project). Reads the CACHED requirements_completion_pct, matching
 * learnerContextService.ts's own deliberate choice not to trigger a live
 * recompute as a side effect of an evidence read.
 *
 * `verifiedStories` counts StudentTask.verified_at IS NOT NULL — the real
 * platform-confirmed completion gate, distinct from the student's own
 * self-reported `status` (per StudentTask.ts's own header comment).
 */
export async function getProjectProgressField(enrollmentId: string): Promise<SnapshotField<ProjectProgressValue>> {
  const project = await getProjectByEnrollment(enrollmentId);
  if (!project) {
    return {
      value: null, status: 'unknown', sourceSystem: 'projects', sourceRecordIds: [], observedAt: null,
      freshnessPolicy: 'cached-on-progress-recompute', reliabilityState: 'healthy',
      reliabilityReason: 'No active project for this enrollment.',
    };
  }

  const p: any = project;
  const [connection, tasks] = await Promise.all([
    GitHubConnection.findOne({ where: { project_id: p.id } }),
    StudentTask.findAll({ where: { project_id: p.id }, attributes: ['id', 'status', 'verified_at'] }),
  ]);

  const verifiedStories = tasks.filter((t: any) => t.verified_at != null).length;

  return {
    value: {
      name: p.name,
      stage: p.project_stage,
      requirementsCompletionPct: p.requirements_completion_pct,
      repoConnected: !!connection,
      totalStories: tasks.length,
      verifiedStories,
    },
    status: 'known',
    sourceSystem: 'projects',
    sourceRecordIds: [p.id],
    observedAt: p.progress_computed_at ?? new Date(),
    freshnessPolicy: 'cached-on-progress-recompute',
    reliabilityState: 'healthy',
  };
}
