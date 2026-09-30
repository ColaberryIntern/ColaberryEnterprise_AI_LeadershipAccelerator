/**
 * cardPointsService — the engagement "points" a student earns for completing a
 * curriculum item. These are the points the top-right HUD total sums
 * (StudentPointsEvent), and they are DISTINCT from the skill-XP economy
 * (XpEvent) that drives readiness/promotion.
 *
 * Design:
 *  - The amount equals the number the card's "+N pts" badge shows — the sum of the
 *    card's points {learning,builder,community} — so the badge and the HUD can
 *    never drift apart. A points_config override (card_override → type_default,
 *    config.engagement) can still force a specific amount when needed.
 *  - Idempotent per (enrollment, card|lesson) via a stable event_key, leaning on
 *    the student_points_events unique index — re-completing never double-counts.
 *  - Failure-first: award is best-effort and NEVER throws. A points hiccup must
 *    not block the completion/XP pipeline, so callers get 0 back on any error.
 *  - Flag-gated by env.portalPointsAwardEnabled (ON by default).
 */
import { award, sumPointsTodayByEventTypes } from '../pointsService';
import { resolve as resolveType } from '../timeline/typeRegistry';
import { env } from '../../config/env';
import { centralDateKey } from '../centralDate';
import { applyDailyCap, isAmbientLearningType, AMBIENT_LEARNING_CAP, AMBIENT_LEARNING_EVENT_TYPE } from './dailyCap';
// PointsConfig is loaded lazily (dynamic import) inside the resolver so that
// importing this module never triggers the model's Model.init() at load time —
// keeps services that depend on it unit-testable with mocked models.

export interface CardLike {
  id: string;
  type: string;
  points?: { learning?: number | null; builder?: number | null; community?: number | null } | null;
}

/** Sum of a card's points {learning,builder,community} — the exact number its
 *  "+N pts" badge renders (the feed sends `card.points` verbatim, and the badge
 *  is totalPoints(card.points)). Awarding this keeps the badge and the HUD
 *  provably identical. */
function badgePoints(card: CardLike): number {
  const p = card.points || {};
  return Math.max(0, (p.learning || 0) + (p.builder || 0) + (p.community || 0));
}

/** The event_type recorded for a card completion (drives the "Recent points" label). */
export function eventTypeForCard(card: CardLike): string {
  const def = resolveType(card.type);
  const band = (def?.render_band as string) || card.type;
  if (band === 'survey') return 'survey_complete';
  if (card.type === 'evaluation') return 'evaluation_passed';
  if (band === 'quiz') return 'knowledge_check';
  return 'card_complete';
}

/**
 * Resolve how many engagement points a card completion is worth: an explicit
 * points_config override (per-card → per-type) wins; otherwise it's the card's
 * own badge value (sum of its points). Never throws; on any config-read error it
 * falls back to the badge value.
 */
export async function resolveCardEngagementPoints(card: CardLike): Promise<number> {
  try {
    const { default: PointsConfig } = await import('../../models/PointsConfig');
    const override = await PointsConfig.findOne({ where: { scope: 'card_override', key: card.id, is_active: true } });
    if (override && typeof (override as any).config?.engagement === 'number') return Math.max(0, (override as any).config.engagement);
    const typeCfg = await PointsConfig.findOne({ where: { scope: 'type_default', key: card.type, is_active: true } });
    if (typeCfg && typeof (typeCfg as any).config?.engagement === 'number') return Math.max(0, (typeCfg as any).config.engagement);
  } catch {
    /* fall through — config is an optional override, not a dependency */
  }
  // Award exactly what the card's "+N pts" badge shows, so badge and HUD stay in lockstep.
  return badgePoints(card);
}

/**
 * Award engagement points for completing a card. Idempotent per (enrollment,
 * card) via event_key `card:<cardId>`. Returns the points NEWLY awarded (0 if
 * already awarded, disabled by flag, resolves to 0, or on any error).
 */
export async function awardCardCompletionPoints(enrollmentId: string, card: CardLike): Promise<number> {
  if (!env.portalPointsAwardEnabled) return 0;
  try {
    let points = await resolveCardEngagementPoints(card);
    if (points <= 0) return 0;

    let eventType = eventTypeForCard(card);

    // Anti-cheat ambient daily cap (POINTS_DAILY_CAPS_ENABLED, default OFF). The
    // low-value repeatable feed types are grindable, so clamp the award such
    // that the day's ambient total can never exceed AMBIENT_LEARNING_CAP. These
    // completions bank under a dedicated event_type so the running ambient total
    // is measurable in isolation (a plain card_complete can't be told apart from
    // real coursework). A clamp to 0 (cap already reached) skips the award —
    // identical to the points<=0 path above, so idempotency (keyed per card via
    // `card:<id>`) is untouched. Flag OFF ⇒ this block is inert and the award is
    // byte-identical to today.
    if (env.pointsDailyCapsEnabled && isAmbientLearningType(card.type)) {
      const already = await sumPointsTodayByEventTypes(
        enrollmentId, [AMBIENT_LEARNING_EVENT_TYPE], centralDateKey(Date.now()),
      );
      points = applyDailyCap({ alreadyAwardedToday: already, proposedAward: points, cap: AMBIENT_LEARNING_CAP });
      if (points <= 0) return 0;
      eventType = AMBIENT_LEARNING_EVENT_TYPE;
    }

    const res = await award(enrollmentId, {
      eventType,
      eventKey: `card:${card.id}`,
      points,
      metadata: { card_id: card.id, type: card.type },
    });
    return res.awarded ? res.points : 0;
  } catch (err: any) {
    console.warn('[cardPointsService] card award failed (non-fatal)', { card_id: card.id, error_class: err?.name, message: err?.message });
    return 0;
  }
}

/**
 * Award engagement points for completing a legacy curriculum lesson. Idempotent
 * per (enrollment, lesson) via event_key `lesson:<lessonId>`. Uses the
 * lesson_complete registry default (points_config not consulted for lessons).
 */
export async function awardLessonCompletionPoints(enrollmentId: string, lessonId: string): Promise<number> {
  if (!env.portalPointsAwardEnabled) return 0;
  try {
    const res = await award(enrollmentId, {
      eventType: 'lesson_complete',
      eventKey: `lesson:${lessonId}`,
      metadata: { lesson_id: lessonId },
    });
    return res.awarded ? res.points : 0;
  } catch (err: any) {
    console.warn('[cardPointsService] lesson award failed (non-fatal)', { lesson_id: lessonId, error_class: err?.name, message: err?.message });
    return 0;
  }
}
