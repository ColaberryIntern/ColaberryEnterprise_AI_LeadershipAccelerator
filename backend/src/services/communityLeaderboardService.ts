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
  /**
   * The member's canonical rung ("AI Builder III"), resolved server-side for
   * EVERY row so the badge does not depend on which members the page happened
   * to load. From all-time points + StudentLevel, never from the window's
   * points: a 7-day window does not change who someone is. Null only when the
   * lookup degraded.
   */
  rung_name: string | null;
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
    return { member_id: entry.member_id, display_name: entry.display_name, points: entry.points, rank, rung_name: null };
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

  return members.map((m: any) => ({ member_id: m.id, display_name: m.display_name, points: sums.get(m.enrollment_id) ?? 0, enrollment_id: m.enrollment_id }));
}

/**
 * Rung per member, from all-time points and StudentLevel. Non-fatal: a failure
 * here leaves `rung_name` null on every row and the board still renders — the
 * ranking is the product, the badge is the decoration.
 */
async function rungByMemberId(members: Array<{ member_id: string; enrollment_id?: string }>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = members.map((m) => m.enrollment_id).filter((id): id is string => !!id);
  if (ids.length === 0) return out;
  try {
    const [{ getTotalsForEnrollments }, { getRungNamesForEnrollments }] = await Promise.all([
      import('./pointsService'),
      import('./progression/progressionService'),
    ]);
    const totals = await getTotalsForEnrollments(ids);
    const rungs = await getRungNamesForEnrollments(ids, totals);
    for (const m of members) {
      const rung = m.enrollment_id ? rungs.get(m.enrollment_id) : undefined;
      if (rung) out.set(m.member_id, rung);
    }
  } catch (err: any) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'backend',
      event: 'leaderboard_rung_lookup_failed', outcome: 'partial',
      error_class: err?.name || 'Error', context: { message: err?.message },
    }));
  }
  return out;
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
  const rungs = await rungByMemberId(raw);
  const ranked = rankMembers(raw).map((e) => ({ ...e, rung_name: rungs.get(e.member_id) ?? null }));

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
