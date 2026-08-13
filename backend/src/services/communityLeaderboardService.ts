import { Op } from 'sequelize';
import CommunityMember from '../models/CommunityMember';
import StudentPointsEvent from '../models/StudentPointsEvent';
import CommunityLeaderboardEntry, { CommunityLeaderboardPeriod } from '../models/CommunityLeaderboardEntry';
import Enrollment from '../models/Enrollment';
import { resolveCohortId } from './communityService';

export interface LeaderboardEntry {
  member_id: string;
  display_name: string;
  points: number;
  rank: number;
}

const WINDOW_MS: Record<'7d' | '30d', number> = {
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

interface RawPoints {
  member_id: string;
  display_name: string;
  points: number;
}

// Pure — deterministic dense rank. Ties break on display_name so the same
// input always produces the same order regardless of DB row order or call
// timing (REQ-C4 trust control: "deterministic point/level math").
export function rankMembers(members: RawPoints[]): LeaderboardEntry[] {
  const sorted = [...members].sort(
    (a, b) => b.points - a.points || a.display_name.localeCompare(b.display_name)
  );

  let rank = 0;
  let lastPoints: number | null = null;
  return sorted.map((entry, idx) => {
    if (entry.points !== lastPoints) {
      rank = idx + 1;
      lastPoints = entry.points;
    }
    return { member_id: entry.member_id, display_name: entry.display_name, points: entry.points, rank };
  });
}

// Points come from the ONE canonical ledger (StudentPointsEvent / pointsService),
// keyed by enrollment and mapped back to the community member — so this
// leaderboard shows the SAME score as the top-right HUD, not a parallel one.
async function pointsForWindow(cohortId: string, period: CommunityLeaderboardPeriod): Promise<RawPoints[]> {
  const members = await CommunityMember.findAll({
    include: [{ model: Enrollment, as: 'enrollment', attributes: ['id'], where: { cohort_id: cohortId } }],
  });
  if (members.length === 0) return [];

  const enrollmentIds = members.map((m: any) => m.enrollment_id);
  const where: Record<string, unknown> = { enrollment_id: enrollmentIds };
  if (period !== 'all_time') {
    where.created_at = { [Op.gte]: new Date(Date.now() - WINDOW_MS[period]) };
  }

  const events = await StudentPointsEvent.findAll({ where });
  const sums = new Map<string, number>();
  for (const event of events as any[]) {
    sums.set(event.enrollment_id, (sums.get(event.enrollment_id) ?? 0) + (event.points || 0));
  }

  return members.map((m: any) => ({ member_id: m.id, display_name: m.display_name, points: sums.get(m.enrollment_id) ?? 0 }));
}

// Idempotent recompute-and-upsert: re-running for the same (member, period)
// replaces the snapshot row rather than duplicating it (unique constraint on
// community_leaderboard_entries backs this). Snapshotting into the table
// gives an auditable "as of" record even though the response is always
// computed fresh from current data, never read back from the snapshot.
export async function getLeaderboard(
  enrollmentId: string,
  period: CommunityLeaderboardPeriod
): Promise<LeaderboardEntry[]> {
  const cohortId = await resolveCohortId(enrollmentId);
  const raw = await pointsForWindow(cohortId, period);
  const ranked = rankMembers(raw);

  await Promise.all(
    ranked.map((entry) =>
      CommunityLeaderboardEntry.upsert({
        member_id: entry.member_id,
        period,
        points: entry.points,
        rank_snapshot: entry.rank,
        computed_at: new Date(),
      })
    )
  );

  return ranked;
}
