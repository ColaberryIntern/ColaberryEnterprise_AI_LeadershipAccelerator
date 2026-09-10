import { getPointsSummary } from './pointsService';
import { getStreak } from './streakService';
import { getProgressionSummary } from './progression/progressionService';
import { getPromotionStatus } from './progression/promotionService';
import { classifyError } from '../utils/errorClassifier';

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

/**
 * A lens that fails is NOT the same as a lens a student has not unlocked.
 *
 * Both used to be swallowed by a bare `catch {}`, so a student sitting on
 * 1,600 builder XP could be shown "0 XP" under the words "Skill XP starts
 * flowing once your curriculum begins" and nothing anywhere recorded that a
 * call had thrown. The lens still degrades to null, because the engagement
 * lens must always render; what changes is that the failure leaves a trace.
 */
function logLensFailure(lens: string, enrollmentId: string, err: unknown): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    service: 'points-drilldown',
    event: lens + '_lens_failed',
    outcome: 'failure',
    error_class: classifyError(err),
    error: (err as any)?.message ?? String(err),
    enrollment_id: enrollmentId,
  }));
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
  } catch (err) {
    // Degrades to null (the lens is optional) but never silently: see
    // logLensFailure. A student's real XP reading 0 is a defect, not a state.
    logLensFailure('skill_xp', enrollmentId, err);
  }

  let readiness: DrilldownView['readiness'] = null;
  try {
    const st = await getPromotionStatus(enrollmentId);
    readiness = {
      // `st.readiness` is a 0..1 fraction (`computeReadiness`, stored verbatim in
      // `student_level.architect_readiness`). This is rendered as "{pct}% readiness"
      // and as a bar width, so it must be scaled to 0..100 here. Without the *100 a
      // real 0.58 rounded to 1 and the student read "1% readiness" off a page that
      // had measured them at 58%.
      pct: Math.round(st.readiness * 100),
      level: st.level,
      rank: st.rank,
      next_level: st.next_level,
      at_max: st.at_max,
      gaps: st.gaps,
    };
  } catch (err) {
    // Degrades to null (the lens is optional) but never silently: see
    // logLensFailure. A student's real XP reading 0 is a defect, not a state.
    logLensFailure('readiness', enrollmentId, err);
  }

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
