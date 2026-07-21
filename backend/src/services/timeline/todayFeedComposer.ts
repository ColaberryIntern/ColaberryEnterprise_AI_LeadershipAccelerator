/**
 * todayFeedComposer — the Today Timeline v2 engagement engine (Phase 1).
 *
 * Produces a NEVER-ENDING, per-student feed by interleaving:
 *   • ANCHORED items — the student's real curriculum (class/project/… cards that
 *     are today_eligible), pulled from timelineService.getFeed, finite, consumed
 *     in order; and
 *   • AMBIENT items — bottomless rotating content (blog/podcast/testimonial) from
 *     ambientPool, injected on a cadence and alternated across providers.
 *
 * The feed is materialised as an APPEND-ONLY sequence of `today_feed_impressions`
 * rows per enrollment, which buys three properties:
 *   1. Deterministic pagination — re-fetching a cursor returns the exact same
 *      items (read back from their stored rows, never re-rolled).
 *   2. Bottomless scroll — when anchored is exhausted the tail is pure ambient,
 *      and ambient never runs dry (unseen → least-recently-seen rotation).
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
import { planSlots, type TodayItemKind } from './todayFeedPlan';
import { gatherAnchored, rehydrateCommunityItems } from './todayAnchoredSources';
import { env } from '../../config/env';
import { getFeedPolicy } from './feedConfigService';

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

async function persistImpression(enrollmentId: string, it: TodayFeedItem, provider: string | null): Promise<void> {
  await sequelize.query(
    `INSERT INTO today_feed_impressions
       (id, enrollment_id, position, kind, ref, provider, card_id, item, served_at)
     VALUES (:id, :eid, :pos, :kind, :ref, :provider, :card_id, :item::jsonb, NOW())
     ON CONFLICT (enrollment_id, position) DO NOTHING`,
    {
      replacements: {
        id: randomUUID(), eid: enrollmentId, pos: it.position, kind: it.kind, ref: it.ref,
        provider, card_id: it.card_id, item: JSON.stringify(it),
      },
      type: QueryTypes.INSERT,
    },
  );
}

/** Extend the materialised feed by up to `need` items (append-only). Returns them in order. */
async function extendFeed(enrollmentId: string, existing: ImpressionRow[], need: number): Promise<TodayFeedItem[]> {
  const anchoredPlaced = existing.filter((r) => r.kind === 'anchored').length;
  const ambientPlaced = existing.filter((r) => r.kind === 'ambient').length;
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
  const providers: AmbientProviderSlug[] = policy ? policy.ambientProviders : AMBIENT_PROVIDERS;

  const anchoredQueue = await gatherAnchored(enrollmentId, placedRefs);
  const plan = planSlots({
    count: need,
    anchoredAvailable: anchoredQueue.length,
    providers,
    cadence,
    anchoredPlaced,
    ambientPlaced,
  });

  // Fetch the ambient items each provider needs for this batch.
  const perProviderNeed: Record<AmbientProviderSlug, number> = { blog: 0, podcast: 0, testimonial: 0 };
  for (const s of plan.slots) if (s.kind === 'ambient' && s.provider) perProviderNeed[s.provider]++;
  const ambientQueues: Record<AmbientProviderSlug, AmbientItem[]> = { blog: [], podcast: [], testimonial: [] };
  for (const p of providers) {
    if (perProviderNeed[p] > 0) ambientQueues[p] = await pickAmbientBatch(enrollmentId, p, perProviderNeed[p], placedMedia[p]);
  }

  let anchoredCur = 0;
  const out: TodayFeedItem[] = [];
  let pos = existing.length;
  for (const slot of plan.slots) {
    let item: TodayFeedItem | null = null;
    let provider: string | null = null;
    if (slot.kind === 'anchored') {
      const cand = anchoredQueue[anchoredCur++];
      if (cand) item = { ...cand, position: pos };
    } else if (slot.provider) {
      const a = ambientQueues[slot.provider].shift();
      if (a) { item = ambientItemFrom(a, pos); provider = slot.provider; }
    }
    if (!item) continue; // source ran dry (e.g. empty pool) — skip the slot
    await persistImpression(enrollmentId, item, provider);
    out.push(item);
    pos++;
  }
  return out;
}

/**
 * Return the page of the Today feed starting at `cursor` (0-based item offset),
 * generating more of the feed if the cursor runs past what's been materialised.
 */
export async function getTodayPage(enrollmentId: string, cursor = 0, pageSize = DEFAULT_PAGE_SIZE): Promise<TodayPage> {
  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(pageSize)));
  const from = Math.max(0, Math.floor(cursor));
  const targetEnd = from + size;

  let existing = await loadImpressions(enrollmentId);
  let exhausted = false;
  if (existing.length < targetEnd) {
    const before = existing.length;
    const added = await extendFeed(enrollmentId, existing, targetEnd - existing.length);
    exhausted = added.length < targetEnd - before; // couldn't fill the page → pools are dry
    if (added.length) existing = await loadImpressions(enrollmentId);
  }

  const slice = existing.slice(from, targetEnd);
  const items = slice.map((r): TodayFeedItem => ({ ...(r.item as TodayFeedItem), position: r.position, interacted: r.interacted_at != null }));
  // Community cards are dynamic — refresh their media/author/text from the live
  // post so the append-only snapshot never shows stale content (fail-soft).
  await rehydrateCommunityItems(items);
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
