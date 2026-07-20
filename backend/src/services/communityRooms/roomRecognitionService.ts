import { Op } from 'sequelize';
import { resolveCohortId } from '../communityService';
import { award, getPointsSummary } from '../pointsService';
import ContributionEvent, { ContributionCategory, CATEGORY_META } from '../../models/ContributionEvent';
import Enrollment from '../../models/Enrollment';
import { log } from './roomShared';

// Phase B recognition (spec §8.7): reward the behaviors that make a community —
// hosting, helping, showing up — not raw posting. Each contribution is recorded
// once (idempotent) and its points flow into the ONE canonical points system
// (pointsService / StudentPointsEvent — the top-right HUD total), so a student
// has a single score everywhere. The contribution ledger below only tracks the
// recognition *category* (badges); the points themselves live in pointsService.

export interface ContributionInput {
  category: ContributionCategory;
  action: string;
  points: number;
  roomId?: string | null;
  bookingId?: string | null;
  messageId?: string | null;
  idempotencyKey: string;
}

// Idempotent on idempotencyKey; awards points only the first time. Best-effort —
// callers wrap this so a recognition failure never breaks the underlying action.
export async function recordContribution(enrollmentId: string, input: ContributionInput): Promise<void> {
  if (!enrollmentId) return;
  const [, created] = await ContributionEvent.findOrCreate({
    where: { idempotency_key: input.idempotencyKey },
    defaults: {
      enrollment_id: enrollmentId,
      category: input.category,
      action: input.action,
      points: input.points,
      room_id: input.roomId ?? null,
      booking_id: input.bookingId ?? null,
      message_id: input.messageId ?? null,
      idempotency_key: input.idempotencyKey,
    },
  });
  if (created && input.points > 0) {
    // One canonical points ledger: award into pointsService (StudentPointsEvent),
    // idempotent on the same key, so recognition shows up in the top-right HUD
    // total and the community leaderboard — not a parallel score.
    await award(enrollmentId, {
      eventType: `recognition:${input.category}`,
      eventKey: input.idempotencyKey,
      points: input.points,
      metadata: { category: input.category, action: input.action, room_id: input.roomId ?? null, booking_id: input.bookingId ?? null },
    });
    log('info', 'contribution_recorded', { enrollment_id: enrollmentId, category: input.category, points: input.points });
  }
}

// ─── Recognition read model (Phase B #3 — make recognition visible) ──────────
// Turns the raw contribution ledger into something a student sees: the badges
// they've earned (with counts), their recent wins, and their live community
// points/level. Pure read; safe to call on every page load.

export interface ImpactBadge {
  category: ContributionCategory;
  label: string;
  emoji: string;
  blurb: string;
  count: number;
  points: number;
}

export interface ImpactRecentItem {
  category: ContributionCategory;
  label: string;
  emoji: string;
  action: string;
  points: number;
  created_at: Date;
}

export interface ImpactSummary {
  points: number; // canonical total from pointsService (same as the HUD)
  total_contributions: number;
  badges: ImpactBadge[];
  recent: ImpactRecentItem[];
}

export async function getImpact(enrollmentId: string): Promise<ImpactSummary> {
  const [summary, rows] = await Promise.all([
    getPointsSummary(enrollmentId),
    ContributionEvent.findAll({ where: { enrollment_id: enrollmentId }, order: [['created_at', 'DESC']] }),
  ]);

  const byCat = new Map<ContributionCategory, { count: number; points: number }>();
  for (const r of rows) {
    const agg = byCat.get(r.category) || { count: 0, points: 0 };
    agg.count += 1;
    agg.points += r.points;
    byCat.set(r.category, agg);
  }

  const badges: ImpactBadge[] = Array.from(byCat.entries())
    .map(([category, agg]) => ({ category, ...CATEGORY_META[category], count: agg.count, points: agg.points }))
    .sort((a, b) => b.count - a.count || b.points - a.points);

  const recent: ImpactRecentItem[] = rows.slice(0, 8).map((r) => ({
    category: r.category,
    label: CATEGORY_META[r.category].label,
    emoji: CATEGORY_META[r.category].emoji,
    action: r.action,
    points: r.points,
    created_at: r.created_at,
  }));

  return { points: summary.total, total_contributions: rows.length, badges, recent };
}

export interface RecognitionItem {
  enrollment_id: string;
  display_name: string;
  category: ContributionCategory;
  label: string;
  emoji: string;
  action: string;
  points: number;
  created_at: Date;
}

// Cohort-scoped "who's being recognized right now" wall — social proof that
// makes recognition contagious. Scoped to the viewer's cohort (student-data
// isolation, matching the community feed's cohort boundary).
export async function recentRecognition(enrollmentId: string, limit = 12): Promise<RecognitionItem[]> {
  const cohortId = await resolveCohortId(enrollmentId);
  const cohortEnrollments = await Enrollment.findAll({
    where: { cohort_id: cohortId },
    attributes: ['id', 'full_name'],
  });
  if (cohortEnrollments.length === 0) return [];

  const nameById = new Map(cohortEnrollments.map((e) => [e.id, e.full_name]));
  const rows = await ContributionEvent.findAll({
    where: { enrollment_id: { [Op.in]: Array.from(nameById.keys()) } },
    order: [['created_at', 'DESC']],
    limit,
  });

  return rows.map((r) => ({
    enrollment_id: r.enrollment_id,
    display_name: nameById.get(r.enrollment_id) || 'A cohortmate',
    category: r.category,
    label: CATEGORY_META[r.category].label,
    emoji: CATEGORY_META[r.category].emoji,
    action: r.action,
    points: r.points,
    created_at: r.created_at,
  }));
}
