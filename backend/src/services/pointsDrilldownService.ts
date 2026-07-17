import { getPointsSummary } from './pointsService';
import { getStreak } from './streakService';
import { getProgressionSummary } from './progression/progressionService';
import { getPromotionStatus } from './progression/promotionService';

/**
 * Points drill-down — unifies the THREE independent progress systems into one
 * "where you are / where you're headed" view, presented as three lenses:
 *
 *   1. Engagement — the `student_points_events` score + daily streak.
 *   2. Skill XP   — the learning / builder / community XP streams (progression).
 *   3. Readiness  — Architect Readiness %, current Builder level, and the
 *                   explicit remaining gaps to the next level.
 *
 * The two progression lenses degrade to `null` (not an error) when the
 * progression tables aren't provisioned for a student, so the endpoint always
 * returns the engagement lens at minimum.
 */

export interface DrilldownView {
  engagement: {
    total: number;
    streak_days: number;
    streak_points: number;
    recent: Array<{ event_type: string; points: number; created_at: string }>;
  };
  skill_xp: { learning: number; builder: number; community: number; total: number } | null;
  readiness: {
    pct: number;
    level: string;
    rank: number;
    next_level: string | null;
    at_max: boolean;
    gaps: string[];
  } | null;
}

export async function getPointsDrilldown(enrollmentId: string): Promise<DrilldownView> {
  const [summary, streak] = await Promise.all([
    getPointsSummary(enrollmentId),
    getStreak(enrollmentId),
  ]);

  const recent = summary.events.slice(0, 12).map((e) => ({
    event_type: e.event_type,
    points: e.points,
    created_at: e.created_at instanceof Date ? e.created_at.toISOString() : String(e.created_at),
  }));

  let skill_xp: DrilldownView['skill_xp'] = null;
  try {
    const prog = await getProgressionSummary(enrollmentId);
    skill_xp = {
      learning: prog.xp.learning,
      builder: prog.xp.builder,
      community: prog.xp.community,
      total: prog.xp.learning + prog.xp.builder + prog.xp.community,
    };
  } catch { /* progression not provisioned — omit this lens */ }

  let readiness: DrilldownView['readiness'] = null;
  try {
    const st = await getPromotionStatus(enrollmentId);
    readiness = {
      pct: Math.round(st.readiness),
      level: st.level,
      rank: st.rank,
      next_level: st.next_level,
      at_max: st.at_max,
      gaps: st.gaps,
    };
  } catch { /* progression not provisioned — omit this lens */ }

  return {
    engagement: {
      total: summary.total,
      streak_days: streak.count,
      streak_points: streak.total_streak_points,
      recent,
    },
    skill_xp,
    readiness,
  };
}
