/**
 * todayFeedComposer — the Today Timeline v2 engagement engine (Phase 1).
 *
 * Produces a NEVER-ENDING, per-student feed with two tiers:
 *   • PRECEDENCE (`kind: 'anchored'` slots) — the student's real, week-bound
 *     curriculum (blended with Project/Community/session-replay when those
 *     surfaces are on), pulled via todayAnchoredSources.gatherAnchored, finite,
 *     consumed in order. Gets first billing at the configured cadence.
 *   • VARIETY (`kind: 'ambient'` slots, bottomless) — once precedence content
 *     runs out (or between injections, per cadence), EVERY evergreen curriculum
 *     type (ai_news_flash, market_intelligence, ai_tool_of_the_day, …) and every
 *     ambient provider (blog/podcast/testimonial, raw content from ambientPool)
 *     round-robin together as PEERS, one flat rotation — so no single type gets
 *     a bigger per-type share just because it's one of only 3 "providers"
 *     while the others split ~14 ways (the "way too many blogs" bug this fixed
 *     on 2026-08-04: see interleaveGroups/groupByType in ./todayFeedPlan).
 *
 * The feed is materialised as an APPEND-ONLY sequence of `today_feed_impressions`
 * rows per enrollment, which buys three properties:
 *   1. Deterministic pagination — re-fetching a cursor returns the exact same
 *      items (read back from their stored rows, never re-rolled).
 *   2. Bottomless scroll — when precedence content is exhausted the tail is pure
 *      variety, and variety never runs dry (unseen → least-recently-seen
 *      rotation for the ambient providers; evergreen types just keep recycling
 *      via generatedContentRetention's reuse mechanism).
 *   3. Interact-to-hide — an item, once placed, is never re-placed (its media id /
 *      card id is excluded from future generation); interacting just records it.
 *
 * The hard logic is the PURE planner in ./todayFeedPlan (fully unit-tested);
 * this file is the thin I/O shell. Fail-soft throughout: a fetch never throws to
 * the student — worst case it returns fewer items.
 */
import { randomUUID } from 'crypto';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { type FeedVideo, type FeedBlog, type FeedContent } from './timelineService';
import { resolve as resolveType } from './typeRegistry';
import { pickAmbientBatch, AMBIENT_PROVIDERS, type AmbientProviderSlug, type AmbientItem } from './ambientPool';
import { planSlots, interleaveGroups, groupByType, isPrecedenceImpression, type TodayItemKind } from './todayFeedPlan';
import { gatherAnchored, rehydrateCommunityItems, rehydrateSessionItems } from './todayAnchoredSources';
import { orderForVisit } from './todayFeedShuffle';
import { env } from '../../config/env';
import { getFeedPolicy } from './feedConfigService';
import { rankLearningValue } from '../cape/capeLearningValueRanker';

/** Legacy default: inject one ambient item after every CADENCE anchored items.
 *  When FEED_CONTROL_ENABLED, cadence + the active ambient providers come from
 *  the editable feed policy instead (feedConfigService). */
const CADENCE = 2;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 30;

export interface TodayFeedItem {
  position: number;
  kind: TodayItemKind;
  ref: string;                 // `card:<id>` | `<provider>:<mediaId>`
  surface: string;             // home_surface of the type (drives the section colour)
  type: string;                // curriculum type slug
  render_band: string;
  card_id: string | null;      // anchored deep-link target (open/complete)
  title: string | null;
  subtitle: string | null;
  description: string | null;
  image: string | null;
  video: FeedVideo | null;
  blog: FeedBlog | null;
  content: FeedContent | null;
  week: number | null;
  estimated_time: number | null;
  status: string | null;       // anchored progress status
  points?: { learning?: number; builder?: number; community?: number } | null;  // engagement points the card awards (anchored curriculum cards)
  interacted: boolean;
  author?: { name: string; avatar_url: string | null; level: number } | null;  // community posts: the member byline
}

export interface TodayPage {
  items: TodayFeedItem[];
  nextCursor: number;
  exhausted: boolean;          // true only when even ambient produced nothing (empty pools)
}

interface ImpressionRow {
  position: number;
  kind: TodayItemKind;
  ref: string;
  provider: string | null;
  card_id: string | null;
  item: any;                   // stored TodayFeedItem payload
  interacted_at: Date | null;
}

function ambientItemFrom(a: AmbientItem, position: number): TodayFeedItem {
  const def = resolveType(a.provider);
  return {
    position,
    kind: 'ambient',
    ref: a.ref,
    surface: 'today',
    type: a.provider,
    render_band: def?.render_band ?? 'media',
    card_id: null,
    title: a.title,
    subtitle: null,
    description: a.description,
    image: a.image,
    video: a.video,
    blog: a.blog,
    content: null,
    week: null,
    estimated_time: def?.est_minutes ?? null,
    status: null,
    // Blogs are the one collectible ambient type: they award points via the read
    // gate (podcasts/testimonials stay ambient with no points). The badge + the
    // drawer read-gate key off this.
    points: a.provider === 'blog' ? { learning: def?.learning_xp || 10 } : null,
    interacted: false,
  };
}

async function loadImpressions(enrollmentId: string): Promise<ImpressionRow[]> {
  return sequelize.query<ImpressionRow>(
    `SELECT position, kind, ref, provider, card_id, item, interacted_at
       FROM today_feed_impressions WHERE enrollment_id = :eid ORDER BY position ASC`,
    { replacements: { eid: enrollmentId }, type: QueryTypes.SELECT },
  );
}

/** CAPE Phase 4 Stage 5 explanation (design doc §9 Stage 5, §13) — present only
 * when `env.capeLearningValueRankerEnabled` is on and ranking succeeded for
 * this item; absent (all 4 columns stay NULL/[]) otherwise, including every
 * flag-off write. */
export interface CapeExplanation {
  rank_score: number;
  reasons: string[];
  policy_version: number;
  learner_state_version: string;
}

async function persistImpression(enrollmentId: string, it: TodayFeedItem, provider: string | null, explanation?: CapeExplanation): Promise<void> {
  await sequelize.query(
    `INSERT INTO today_feed_impressions
       (id, enrollment_id, position, kind, ref, provider, card_id, item, served_at, rank_score, reasons, policy_version, learner_state_version)
     VALUES (:id, :eid, :pos, :kind, :ref, :provider, :card_id, :item::jsonb, NOW(), :rank_score, :reasons::jsonb, :policy_version, :learner_state_version)
     ON CONFLICT (enrollment_id, position) DO NOTHING`,
    {
      replacements: {
        id: randomUUID(), eid: enrollmentId, pos: it.position, kind: it.kind, ref: it.ref,
        provider, card_id: it.card_id, item: JSON.stringify(it),
        rank_score: explanation?.rank_score ?? null,
        reasons: JSON.stringify(explanation?.reasons ?? []),
        policy_version: explanation?.policy_version ?? null,
        learner_state_version: explanation?.learner_state_version ?? null,
      },
      type: QueryTypes.INSERT,
    },
  );
}

/** Extracts a CAPE explanation from a ranked candidate, if present. Ranked
 * items carry `rank_score`/`reasons`/`policy_version`/`learner_state_version`
 * at runtime (stamped by `capeLearningValueRanker.rankLearningValue`) even
 * though `TodayFeedItem`'s own type doesn't declare them — this is the one
 * place that bridges the two, via an explicit runtime check
 * (`typeof rank_score === 'number'`), never an unchecked cast. Returns
 * `undefined` for every flag-off item, so `persistImpression` writes NULL/[]
 * for all 4 new columns exactly as it did before this task. */
export function extractCapeExplanation(cand: TodayFeedItem): CapeExplanation | undefined {
  const c = cand as TodayFeedItem & Partial<CapeExplanation>;
  if (typeof c.rank_score !== 'number') return undefined;
  return {
    rank_score: c.rank_score,
    reasons: Array.isArray(c.reasons) ? c.reasons : [],
    policy_version: c.policy_version ?? 0,
    learner_state_version: c.learner_state_version ?? '',
  };
}

/**
 * CAPE Phase 4 flag-ON ranking step (design doc §9, §16 Phase 4). Applied
 * AFTER `selectAnchoredOrder` (which stays a pure passthrough — see its own
 * doc comment) so the flag-off contract that function's tests prove is
 * completely unaffected by this function's existence. A ranking failure
 * (thrown `CapeLearnerStateError`, a DB blip, anything) is caught and logged
 * here — the feed falls back to the unranked precedence/week-bound order
 * rather than breaking, matching this file's own "fail-soft throughout"
 * contract.
 */
export async function applyCapeRankingIfEnabled(enrollmentId: string, anchoredQueue: TodayFeedItem[]): Promise<TodayFeedItem[]> {
  if (!env.capeLearningValueRankerEnabled || !anchoredQueue.length) return anchoredQueue;
  try {
    const ranked = await rankLearningValue(enrollmentId, anchoredQueue, new Date());
    return ranked.items;
  } catch (err: any) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'backend',
      event: 'cape_learning_value_ranking_failed',
      error_class: err?.name || 'Error',
      outcome: 'failure',
      context: { enrollment_id: enrollmentId, candidate_count: anchoredQueue.length, message: err?.message },
    }));
    return anchoredQueue;
  }
}

/**
 * CAPE Phase 4 wiring seam (design doc §9, §16 Phase 4). The single call site
 * both `extendFeed` and `composeReadOnlyPage` route the precedence/week-bound
 * queue through before consumption. Flag OFF (the default, everywhere
 * including production) returns the SAME array, SAME order `gatherAnchored`
 * produced — a pure passthrough, proven by identity (`toBe`, not just
 * `toEqual`) in `todayFeedComposer.capeFlagOff.test.ts`, so this is
 * byte-identical to pre-Phase-4 behavior. Flag ON routes through
 * `applyCapeRankingIfEnabled` (a separate function layered on top — see its
 * own doc comment) which delegates to the CAPE learning-value ranker.
 */
export function selectAnchoredOrder(anchoredQueue: TodayFeedItem[], capeEnabled: boolean): TodayFeedItem[] {
  return anchoredQueue;
}

/** Real ambient providers (raw blog_posts/podcasts/network_videos pickers) — the
 *  subset of "variety" keys that need an on-demand DB fetch via ambientPool,
 *  as opposed to evergreen curriculum types (already resolved cards). */
const REAL_AMBIENT_PROVIDERS = new Set<string>(AMBIENT_PROVIDERS);

/** Extend the materialised feed by up to `need` items (append-only). Returns them in order. */
async function extendFeed(enrollmentId: string, existing: ImpressionRow[], need: number): Promise<TodayFeedItem[]> {
  // "Precedence" tier = real, week-bound curriculum (and curriculum-adjacent
  // project/community/session work) — derived from each row's own stored
  // kind+week rather than a separate column, so it applies to impressions
  // persisted before this distinction existed too (see isPrecedenceImpression).
  // Everything else (evergreen curriculum types + the 3 ambient providers) is
  // the "variety" tier that round-robins evenly by type.
  const anchoredPlaced = existing.filter((r) => isPrecedenceImpression({ kind: r.kind, week: (r.item as TodayFeedItem | null)?.week ?? null })).length;
  const ambientPlaced = existing.length - anchoredPlaced;
  const placedRefs = new Set(existing.map((r) => r.ref));
  const placedMedia: Record<AmbientProviderSlug, string[]> = { blog: [], podcast: [], testimonial: [] };
  for (const r of existing) {
    if (r.kind === 'ambient' && r.provider && r.ref.includes(':')) {
      const mediaId = r.ref.slice(r.ref.indexOf(':') + 1);
      if (r.provider in placedMedia) placedMedia[r.provider as AmbientProviderSlug].push(mediaId);
    }
  }

  // Cadence + active ambient providers come from the editable policy when the
  // Feed Control plane is on; otherwise the legacy hardcoded constants (flag-off
  // ≡ byte-identical to before).
  const policy = env.feedControlEnabled ? await getFeedPolicy() : null;
  const cadence = policy ? policy.todayCadence : CADENCE;
  const ambientProviders: AmbientProviderSlug[] = policy ? policy.ambientProviders : AMBIENT_PROVIDERS;

  const { weekBound: gatheredWeekBound, evergreenByType } = await gatherAnchored(enrollmentId, placedRefs);
  // CAPE Phase 4: reorder the PRECEDENCE/week-bound queue only (design doc §9,
  // execution-contract.md Assumption 3) — the variety tier below (evergreen
  // types + ambient providers) is untouched by this phase, flag on or off.
  const weekBound = await applyCapeRankingIfEnabled(
    enrollmentId,
    selectAnchoredOrder(gatheredWeekBound, env.capeLearningValueRankerEnabled),
  );
  // The variety pool: every evergreen curriculum type is a peer of every
  // ambient provider — one flat round-robin, so no single type (whether it's
  // "blog" or "market_intelligence") gets a bigger per-type share than another.
  const varietyKeys: string[] = [...ambientProviders, ...evergreenByType.keys()];
  const plan = planSlots({
    count: need,
    anchoredAvailable: weekBound.length,
    providers: varietyKeys,
    cadence,
    anchoredPlaced,
    ambientPlaced,
  });

  // Fetch/assemble what each variety key needs for this batch: real ambient
  // providers need an on-demand DB fetch; evergreen types are already resolved
  // cards, just sliced off the front of their group.
  const perKeyNeed: Record<string, number> = {};
  for (const s of plan.slots) if (s.kind === 'ambient' && s.provider) perKeyNeed[s.provider] = (perKeyNeed[s.provider] ?? 0) + 1;
  const ambientQueues: Record<string, AmbientItem[]> = {};
  const evergreenQueues: Record<string, TodayFeedItem[]> = {};
  for (const key of varietyKeys) {
    const n = perKeyNeed[key] ?? 0;
    if (n <= 0) continue;
    if (REAL_AMBIENT_PROVIDERS.has(key)) {
      ambientQueues[key] = await pickAmbientBatch(enrollmentId, key as AmbientProviderSlug, n, placedMedia[key as AmbientProviderSlug] ?? []);
    } else {
      evergreenQueues[key] = (evergreenByType.get(key) ?? []).slice(0, n);
    }
  }

  let anchoredCur = 0;
  const out: TodayFeedItem[] = [];
  let pos = existing.length;
  for (const slot of plan.slots) {
    let item: TodayFeedItem | null = null;
    let provider: string | null = null;
    let explanation: CapeExplanation | undefined;
    if (slot.kind === 'anchored') {
      const cand = weekBound[anchoredCur++];
      if (cand) {
        item = { ...cand, position: pos };
        explanation = extractCapeExplanation(cand);
      }
    } else if (slot.provider && REAL_AMBIENT_PROVIDERS.has(slot.provider)) {
      const a = ambientQueues[slot.provider]?.shift();
      if (a) { item = ambientItemFrom(a, pos); provider = slot.provider; }
    } else if (slot.provider) {
      const cand = evergreenQueues[slot.provider]?.shift();
      if (cand) item = { ...cand, position: pos }; // real card — provider stays null, same as weekBound curriculum
    }
    if (!item) continue; // source ran dry (e.g. empty pool) — skip the slot
    await persistImpression(enrollmentId, item, provider, explanation);
    out.push(item);
    pos++;
  }
  return out;
}

/** Card ids the student has already completed — dropped from the served feed so a
 *  finished task disappears off the timeline. Batched, fail-soft (error → none
 *  dropped, never breaks the feed). */
async function completedCardIds(enrollmentId: string, cardIds: string[]): Promise<Set<string>> {
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

/** Blog refs the student has already collected points for — dropped from the feed
 *  so a read blog disappears (award is keyed on the same `blog:<id>` ref). */
async function collectedBlogRefs(enrollmentId: string, refs: string[]): Promise<Set<string>> {
  const blogRefs = Array.from(new Set(refs.filter((r) => r.startsWith('blog:'))));
  if (!blogRefs.length) return new Set();
  try {
    const rows = await sequelize.query<{ event_key: string }>(
      `SELECT event_key FROM student_points_events
         WHERE enrollment_id = :eid AND event_key IN (:keys)`,
      { replacements: { eid: enrollmentId, keys: blogRefs }, type: QueryTypes.SELECT },
    );
    return new Set(rows.map((r) => r.event_key));   // 'blog:<id>' — same string as the impression ref
  } catch (err: any) {
    console.warn('[todayFeedComposer] collected-blog lookup failed:', err?.message?.split('\n')[0]);
    return new Set();
  }
}

/**
 * The list actually served for a page: the materialised impressions minus cards
 * the student has completed ("finished tasks disappear"), reordered per visit when
 * a seed is supplied ("a different lineup each time"). Order is stable for a given
 * seed so pagination within one visit never repeats or skips.
 */
async function buildServed(enrollmentId: string, existing: ImpressionRow[], seed?: number): Promise<TodayFeedItem[]> {
  const [completed, collectedBlogs] = await Promise.all([
    completedCardIds(enrollmentId, existing.map((r) => r.card_id).filter((x): x is string => !!x)),
    collectedBlogRefs(enrollmentId, existing.map((r) => r.ref)),
  ]);
  const items = existing
    .filter((r) => !(r.card_id && completed.has(r.card_id)))                        // completed via progress
    .filter((r) => !collectedBlogs.has(r.ref))                                      // blog points already collected
    .filter((r) => (r.item as TodayFeedItem | null)?.status !== 'completed')        // snapshot already completed (project/etc.)
    .map((r): TodayFeedItem => ({ ...(r.item as TodayFeedItem), position: r.position, interacted: r.interacted_at != null }));
  return seed != null ? orderForVisit(items, seed) : items;
}

/**
 * Read-only "view as" page: compose a FRESH, non-persisted feed each visit so an
 * admin viewing a member sees a fluent, different-each-refresh timeline (like the
 * member's own reshuffling feed) instead of their frozen materialised set — WITHOUT
 * writing to the member's impression log or the ambient seen-ledgers. Seed-stable
 * per visit (different seed → different content + order).
 */
async function composeReadOnlyPage(enrollmentId: string, from: number, size: number, seed?: number): Promise<TodayFeedItem[]> {
  const targetEnd = from + size;
  const { weekBound: gatheredWeekBound, evergreenByType } = await gatherAnchored(enrollmentId, new Set<string>());
  // CAPE Phase 4: same flag-gated reorder as the real (materialised) path, so
  // an admin "view as" preview matches what a flag-on student would actually see.
  const weekBound = await applyCapeRankingIfEnabled(
    enrollmentId,
    selectAnchoredOrder(gatheredWeekBound, env.capeLearningValueRankerEnabled),
  );
  const policy = env.feedControlEnabled ? await getFeedPolicy() : null;
  const providers: AmbientProviderSlug[] = policy ? policy.ambientProviders : AMBIENT_PROVIDERS;
  const perProvider = Math.max(6, Math.ceil((targetEnd + 8) / Math.max(1, providers.length)));
  const ambientBatches = await Promise.all(
    providers.map((p) => pickAmbientBatch(enrollmentId, p, perProvider, [], { readOnly: true, seed })),
  );
  const ambient = ambientBatches.flat().map((a) => ambientItemFrom(a, 0));
  // Same variety-tier merge as the real path (extendFeed): evergreen curriculum
  // types round-robin evenly alongside the ambient providers rather than each
  // clumping together, so the admin "view as" preview matches what a student's
  // real feed actually looks like.
  const varietyGroups = new Map([...evergreenByType, ...groupByType(ambient, (i) => i.type)]);
  const combined = [...weekBound, ...interleaveGroups(varietyGroups)];
  const ordered = (seed != null ? orderForVisit(combined, seed) : combined)
    .map((it, i): TodayFeedItem => ({ ...it, position: i, interacted: false }));
  const [completed, collectedBlogs] = await Promise.all([
    completedCardIds(enrollmentId, ordered.map((i) => i.card_id).filter((x): x is string => !!x)),
    collectedBlogRefs(enrollmentId, ordered.map((i) => i.ref)),
  ]);
  const survivors = ordered.filter((i) =>
    !(i.card_id && completed.has(i.card_id)) && !collectedBlogs.has(i.ref) && i.status !== 'completed');
  return survivors.slice(from, targetEnd);
}

/**
 * Return the page of the Today feed starting at `cursor` (0-based item offset),
 * generating more of the feed if the cursor runs past what's been materialised.
 * `seed` (per-visit, client-supplied) reshuffles the lineup; completed cards are
 * filtered out at serve time. Because completed cards are dropped here, the feed
 * may need to be generated past `targetEnd` to backfill the gap.
 */
export async function getTodayPage(enrollmentId: string, cursor = 0, pageSize = DEFAULT_PAGE_SIZE, opts: { readOnly?: boolean; seed?: number } = {}): Promise<TodayPage> {
  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(pageSize)));
  const from = Math.max(0, Math.floor(cursor));
  const targetEnd = from + size;

  // Read-only "view as": ephemeral fresh feed (no writes), so the viewer sees a
  // live, different-each-refresh timeline rather than the member's frozen set.
  if (opts.readOnly) {
    const items = await composeReadOnlyPage(enrollmentId, from, size, opts.seed);
    await rehydrateCommunityItems(items);
    await rehydrateSessionItems(items);
    return { items, nextCursor: from + items.length, exhausted: items.length < size };
  }

  let existing = await loadImpressions(enrollmentId);
  let served = await buildServed(enrollmentId, existing, opts.seed);
  let exhausted = false;

  // Materialise until enough SURVIVING items fill the page (completed cards were
  // dropped above), or the pools run dry. Bounded so a persistently short pool
  // can never spin.
  let guard = 0;
  while (served.length < targetEnd && guard++ < 6) {
    const before = existing.length;
    const added = await extendFeed(enrollmentId, existing, targetEnd - served.length + 4);
    if (!added.length) { exhausted = true; break; }
    existing = await loadImpressions(enrollmentId);
    if (existing.length === before) { exhausted = true; break; }
    served = await buildServed(enrollmentId, existing, opts.seed);
  }

  const items = served.slice(from, targetEnd);
  // Community + session cards are dynamic — refresh community media/author/text
  // and session recording/recap from the live rows so the append-only snapshot
  // never shows stale content (both fail-soft).
  await rehydrateCommunityItems(items);
  await rehydrateSessionItems(items);
  return { items, nextCursor: from + items.length, exhausted: exhausted && items.length < size };
}

export type TodayInteraction = 'open' | 'click' | 'complete' | 'dismiss';

/** Record an interaction on a placed feed item (interact-to-hide is client-side; this makes it durable). */
export async function recordTodayInteraction(enrollmentId: string, ref: string, action: TodayInteraction): Promise<{ ok: true }> {
  await sequelize.query(
    `UPDATE today_feed_impressions SET interacted_at = NOW(), interaction = :action
       WHERE enrollment_id = :eid AND ref = :ref`,
    { replacements: { eid: enrollmentId, ref, action }, type: QueryTypes.UPDATE },
  );
  return { ok: true };
}
