/**
 * githubEvidenceService — turns a student's GitHub activity into progression
 * evidence. Consumes the existing StudentGithubActivity snapshot (this tab
 * does NOT provision repos — that governance-sensitive path is owned by the
 * Projects tab). Idempotent: one commit-evidence per active date, keyed on
 * the date, so re-syncing the same snapshot never double-counts.
 */
import StudentGithubActivity from '../../models/StudentGithubActivity';
import { recordEvidence } from './evidenceEngine';

const GITHUB_TYPE = 'github_sync';
const GITHUB_WEIGHTS = [{ domain_id: 'github', weight: 1 }];

export interface GithubSyncResult { commit_days: number; created: number; }

export async function syncForEnrollment(enrollmentId: string): Promise<GithubSyncResult> {
  const activity = await StudentGithubActivity.findOne({
    where: { enrollment_id: enrollmentId },
    order: [['created_at', 'DESC']],
  });
  if (!activity) return { commit_days: 0, created: 0 };

  const graph = (activity.contribution_graph_json || []) as Array<{ date: string; count: number }>;
  const activeDays = graph.filter((d) => d && d.count > 0);

  let created = 0;
  for (const day of activeDays) {
    const res = await recordEvidence({
      enrollmentId,
      source: 'github_commit',
      sourceRef: day.date, // stable per date -> idempotent
      typeSlug: GITHUB_TYPE,
      competencyWeights: GITHUB_WEIGHTS,
      cardId: null,
    });
    if (res.created) created += 1;
  }
  return { commit_days: activeDays.length, created };
}
