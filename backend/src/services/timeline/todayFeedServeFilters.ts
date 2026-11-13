/**
 * todayFeedServeFilters — the serve-time lookups that decide which materialised Today items are still shown:
 * completed cards, cards no longer published, and ambient items whose points were already collected.
 *
 * Also: community posts the student can no longer open (another cohort, or removed).
 *
 * Moved verbatim out of todayFeedComposer.ts (C107, Nov 2026): that file was over the 500-line ceiling and C107 adds
 * to it. Every function here is fail-soft in the direction that keeps content on the page.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import TimelineCard from '../../models/TimelineCard';
import { isCardServable } from './curriculumScope';

/** Card ids the student has already completed — dropped from the served feed so a
 *  finished task disappears off the timeline. Batched, fail-soft (error → none
 *  dropped, never breaks the feed). */
export async function completedCardIds(enrollmentId: string, cardIds: string[]): Promise<Set<string>> {
  const ids = Array.from(new Set(cardIds.filter((x): x is string => !!x)));
  if (!ids.length) return new Set();
  try {
    const rows = await sequelize.query<{ card_id: string }>(
      `SELECT card_id FROM timeline_card_progress
         WHERE enrollment_id = :eid AND status = 'completed' AND card_id IN (:ids)`,
      { replacements: { eid: enrollmentId, ids }, type: QueryTypes.SELECT },
    );
    return new Set(rows.map((r) => r.card_id));
  } catch (err: any) {
    console.warn('[todayFeedComposer] completed lookup failed:', err?.message?.split('\n')[0]);
    return new Set();
  }
}

/**
 * Card ids that are no longer SERVABLE — dropped from the served feed because
 * every action against them would 404.
 *
 * The Today feed is an append-only snapshot: `today_feed_impressions` stores a
 * frozen copy of the item and replays it forever, never re-consulting the live
 * row. Meanwhile `generatedContentRetention.pruneGeneratedContent` flips cards
 * from `published` to `archived` on an 18-day cycle, on the documented (and,
 * for this path, false) assumption that "getFeed only returns
 * visibility='published' … so flipping visibility -> 'archived' is the
 * discard". That is true of the Classroom, which reads through `getFeed`; it
 * was never true here.
 *
 * The result a student saw: the card renders, `POST /cards/:id/content` 200s,
 * and then `dwell`/`watch`/`openCard` all 404 "Card not available" — so Collect
 * Points sat frozen at "0s of 120s" through 140 seconds and fifteen heartbeats,
 * the gate could never be satisfied, and the button never appeared. Half of a
 * sampled 40-item feed was dead this way.
 *
 * Uses the shared {@link isCardServable} predicate rather than its own
 * `!== 'published'` — one rule, consulted by both the read side and the write
 * side, because two copies drifting apart is what produced this bug.
 *
 * POSITIVE IDENTIFICATION ONLY, and this is the important part. A card is
 * dropped when a row came back and that row says it is not servable. A card
 * whose row is simply ABSENT from the result is treated as UNKNOWN and KEPT —
 * absence is never read as a verdict.
 *
 * The first cut of this function did infer "missing row ⇒ unservable", on the
 * reasoning that `findByPk` in the action handlers would 404 on it anyway. That
 * was wrong, and an existing test caught it: `Model.findAll` routes through
 * `sequelize.query`, so anything that intercepts or perturbs that layer yields
 * an empty result set, and the inference silently converted it into "every card
 * is dead" — `todayFeedComposer.suppressionSharedPath` went from `["card:kept"]`
 * to `[]`. The asymmetry decides it: keeping a vanished card costs the student a
 * 404 they already get today, while dropping a live one costs them real content
 * for no reason. So only a row that positively states a non-published
 * visibility is allowed to remove anything.
 *
 * Batched, and fail-soft in the same safe direction: on error nothing is
 * dropped, so a database blip degrades to today's behaviour rather than
 * emptying the student's landing page.
 */
export async function unservableCardIds(cardIds: string[]): Promise<Set<string>> {
  const ids = Array.from(new Set(cardIds.filter((x): x is string => !!x)));
  if (!ids.length) return new Set();
  try {
    const rows = await TimelineCard.findAll({ where: { id: ids }, attributes: ['id', 'visibility'] });
    return new Set(
      rows
        .map((r) => r.get({ plain: true }) as { id: string; visibility: string | null })
        .filter((r) => !isCardServable(r.visibility))
        .map((r) => r.id),
    );
  } catch (err: any) {
    console.warn('[todayFeedComposer] servable lookup failed:', err?.message?.split('\n')[0]);
    return new Set();
  }
}

const COMMUNITY_PREFIX = 'community:';

/**
 * Community refs the student can no longer open: the post sits in ANOTHER cohort, or staff removed it.
 *
 * Same root cause as unservableCardIds above: the feed replays a frozen snapshot, and nothing re-asked whether the
 * post was still the student's. A learner who moved cohort (an Explorer who paid, a learner moved to a later batch)
 * kept every post placed under the old cohort, and opening one answered 403 "This post belongs to a different
 * cohort" (communityService.requireVisiblePostInCohort). Measured on production 12 Nov 2026: 391 such impressions
 * across 75 learners, plus 11 removed posts across 9.
 *
 * The rule is the one the post route enforces, so the feed never offers what the route refuses. POSITIVE
 * IDENTIFICATION ONLY, as above: a ref is dropped when its post row came back AND that row says other-cohort or
 * removed. A missing row, a missing enrollment, or a failed lookup keeps the item.
 */
export async function unreachableCommunityRefs(enrollmentId: string, refs: string[]): Promise<Set<string>> {
  const ids = Array.from(new Set(refs.filter((r) => r.startsWith(COMMUNITY_PREFIX)).map((r) => r.slice(COMMUNITY_PREFIX.length))));
  if (!ids.length) return new Set();
  try {
    const rows = await sequelize.query<{ id: string; cohort_id: string | null; status: string | null; viewer_cohort: string | null }>(
      `SELECT p.id, p.cohort_id, p.status, e.cohort_id AS viewer_cohort
         FROM community_posts p
         CROSS JOIN (SELECT cohort_id FROM enrollments WHERE id = :eid) e
        WHERE p.id IN (:ids)`,
      { replacements: { eid: enrollmentId, ids }, type: QueryTypes.SELECT },
    );
    return new Set(
      rows
        .filter((r) => r.status === 'removed' || (r.viewer_cohort != null && r.cohort_id !== r.viewer_cohort))
        .map((r) => `${COMMUNITY_PREFIX}${r.id}`),
    );
  } catch (err: any) {
    console.warn('[todayFeedComposer] community reachability lookup failed:', err?.message?.split('\n')[0]);
    return new Set();
  }
}

/** Ambient kinds whose points award is keyed on the feed ref itself — `blog:<id>`
 *  (blogReadGateService), `podcast:<id>` and `testimonial:<id>`
 *  (ambientMediaGateService). The points event and the impression share the
 *  exact string, which is what lets "collected" be decided without a join. */
export const COLLECTIBLE_AMBIENT_PREFIXES = ['blog:', 'podcast:', 'testimonial:'] as const;
export const isCollectibleAmbientRef = (ref: string) => COLLECTIBLE_AMBIENT_PREFIXES.some((p) => ref.startsWith(p));

/** Ambient refs the student has already collected points for. Restricted to
 *  `refs` when given (serve-time: "is this placed item collected?"), otherwise
 *  every collected ref on record (generation: "never place these again").
 *  A collected item leaves the feed for good — Ali, 2026-09-11: "a collected
 *  podcast should be removed from the timeline for ever." Fails open to an
 *  empty set: a lookup error must never blank a feed. */
export async function collectedAmbientRefs(enrollmentId: string, refs?: string[]): Promise<Set<string>> {
  const keys = refs ? Array.from(new Set(refs.filter(isCollectibleAmbientRef))) : null;
  if (keys && !keys.length) return new Set();
  try {
    const rows = keys
      ? await sequelize.query<{ event_key: string }>(
        `SELECT event_key FROM student_points_events
           WHERE enrollment_id = :eid AND event_key IN (:keys)`,
        { replacements: { eid: enrollmentId, keys }, type: QueryTypes.SELECT },
      )
      : await sequelize.query<{ event_key: string }>(
        `SELECT event_key FROM student_points_events
           WHERE enrollment_id = :eid AND (${COLLECTIBLE_AMBIENT_PREFIXES.map((_, i) => `event_key LIKE :p${i}`).join(' OR ')})`,
        { replacements: { eid: enrollmentId, ...Object.fromEntries(COLLECTIBLE_AMBIENT_PREFIXES.map((p, i) => [`p${i}`, `${p}%`])) }, type: QueryTypes.SELECT },
      );
    return new Set(rows.map((r) => r.event_key).filter(isCollectibleAmbientRef));   // same string as the impression ref
  } catch (err: any) {
    console.warn('[todayFeedComposer] collected-ambient lookup failed:', err?.message?.split('\n')[0]);
    return new Set();
  }
}
