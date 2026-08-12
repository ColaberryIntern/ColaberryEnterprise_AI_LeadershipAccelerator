/**
 * todayFeedPlan — the PURE core of the Today Timeline v2 engagement engine.
 * No I/O, no randomness, no DB imports (the AmbientProviderSlug import is
 * type-only and erased at compile), so it is trivially unit-testable and
 * deterministic. The composer (todayFeedComposer.ts) is the I/O shell that fills
 * the slots this planner lays out.
 */
import { isCompletableType } from './timelineGatingService';
import { BUCKET_ORDER } from './timelineService';

export type TodayItemKind = 'anchored' | 'ambient';
export interface PlannedSlot { kind: TodayItemKind; provider?: string; }

/**
 * Decide the kind (and ambient/variety key) for the next `count` feed slots.
 * Cadence = anchored (precedence) items between variety injections; `providers`
 * (the variety keys — real ambient providers PLUS evergreen curriculum types,
 * see `todayAnchoredSources.gatherAnchored`) round-robin and never repeat
 * back-to-back when more than one is available. When anchored is exhausted the
 * remainder is pure variety (bottomless). `anchoredPlaced` / `ambientPlaced`
 * carry cadence + round-robin continuity across pages.
 */
export function planSlots(opts: {
  count: number;
  anchoredAvailable: number;
  providers: string[];
  cadence: number;
  anchoredPlaced: number;
  ambientPlaced: number;
}): { slots: PlannedSlot[]; anchoredUsed: number; ambientUsed: number } {
  const cad = Math.max(1, Math.floor(opts.cadence));
  const providers = opts.providers;
  let anchoredRem = Math.max(0, opts.anchoredAvailable);
  let sinceAmbient = ((opts.anchoredPlaced % cad) + cad) % cad;
  let providerIdx = Math.max(0, opts.ambientPlaced);
  const slots: PlannedSlot[] = [];
  let anchoredUsed = 0;
  let ambientUsed = 0;
  let lastProvider: string | undefined;

  for (let i = 0; i < opts.count; i++) {
    const wantAnchored = anchoredRem > 0 && sinceAmbient < cad;
    let kind: TodayItemKind;
    if (wantAnchored) kind = 'anchored';
    else if (providers.length > 0) kind = 'ambient';
    else if (anchoredRem > 0) kind = 'anchored';   // no ambient providers → keep placing anchored
    else break;                                     // nothing left to place

    if (kind === 'anchored') {
      slots.push({ kind: 'anchored' });
      anchoredRem--; anchoredUsed++; sinceAmbient++;
    } else {
      let provider = providers[providerIdx % providers.length];
      if (providers.length > 1 && provider === lastProvider) {
        providerIdx++;
        provider = providers[providerIdx % providers.length];
      }
      slots.push({ kind: 'ambient', provider });
      lastProvider = provider;
      providerIdx++; ambientUsed++; sinceAmbient = 0;
    }
  }
  return { slots, anchoredUsed, ambientUsed };
}

/**
 * Access gate for ANCHORED curriculum in the Today feed. Free / Explorer members
 * (no paid membership) never see curriculum beyond Week 0; paid members see up to
 * the current week, which is enforced upstream by the shared feed's release/unlock
 * gating (the composer already drops `locked` cards). Ambient content
 * (blog/podcast/testimonial) is unaffected — free users still get the full stream.
 */
export function anchoredWeekAllowed(week: number | null, isExplorer: boolean): boolean {
  if (!isExplorer) return true;   // paid: current-week bound handled by lock gating
  return week === 0;              // free: Week 0 curriculum only
}

/**
 * PURE — should this card even be subject to week-based Today gating at all?
 * Only week-bound cards (`week != null`) are, REGARDLESS of surface.
 *
 * REGRESSION GUARD (2026-08-03): the call site used to gate on
 * `surfaceOf(c.type) === 'class'` instead of this — but `announcement`
 * (`home_surface: 'today'`), `implementation_task`/`artifact_submission`
 * (`home_surface: 'project'`), and some `community_discussion` cards all
 * carry a real `week` despite living on a non-'class' surface, so the week
 * gate silently never ran for them at all, no matter what
 * `anchoredWeekAllowed`/`weekStartedForToday` themselves returned. Evergreen
 * Today content (news/tools/quotes) has `week: null` and must never be
 * gated, or free users see none of it (null !== 0) — that's the actual
 * invariant this protects, not surface.
 */
export function isWeekGated(week: number | null): boolean {
  return week != null;
}

/**
 * PURE — bucket items by a grouping key, preserving each group's own internal
 * relative order and the order groups were first seen. Shared building block
 * for `interleaveByType` and for merging multiple candidate pools (evergreen
 * curriculum types, ambient providers) into one round-robin-able shape.
 */
export function groupByType<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return groups;
}

/**
 * PURE — round-robin interleave already-grouped buckets, preserving each
 * bucket's own internal order. This is the actual "take one from each in
 * turn" mechanic; `interleaveByType` is just `groupByType` + this.
 */
export function interleaveGroups<T>(groups: Map<string, T[]>): T[] {
  const groupOrder = Array.from(groups.keys());
  const cursors = new Map<string, number>(groupOrder.map((k) => [k, 0]));
  const out: T[] = [];
  let remaining = 0;
  for (const list of groups.values()) remaining += list.length;
  while (remaining > 0) {
    for (const key of groupOrder) {
      const list = groups.get(key)!;
      const idx = cursors.get(key)!;
      if (idx < list.length) {
        out.push(list[idx]);
        cursors.set(key, idx + 1);
        remaining--;
      }
    }
  }
  return out;
}

/**
 * PURE — round-robin interleave items by a grouping key, preserving each
 * group's own internal relative order. Used so no single evergreen content
 * type (e.g. an intelligence-pipeline generator that has accumulated
 * hundreds of cards over time) can dominate the anchored queue and bury a
 * smaller, curated sibling type just because it has more rows in the DB —
 * without this, `feed.cards`' raw `ORDER BY week ASC, order ASC` groups all
 * week:null evergreen cards together with no type diversity, and ties on the
 * shared default `order = 0` fall back to arbitrary/insertion order.
 */
export function interleaveByType<T>(items: T[], keyOf: (item: T) => string): T[] {
  return interleaveGroups(groupByType(items, keyOf));
}

/**
 * PURE — is this a stored `today_feed_impressions` row real, precedence-tier
 * curriculum (a week-bound card the student is actually assigned), or does it
 * belong to the bottomless "variety" tier (evergreen curriculum types PLUS the
 * ambient blog/podcast/testimonial providers)? Derived from the row's own
 * stored `kind`/`week` rather than a separate column, so it applies
 * retroactively to impressions persisted before this distinction existed —
 * no backfill needed. `kind` itself is untouched (still reflects real
 * provenance: a card vs. a raw ambient-provider pick) — this is a SEPARATE
 * scheduling-tier classification layered on top, purely for cadence-cursor
 * bookkeeping (`anchoredPlaced` / `ambientPlaced` continuity across pages).
 */
export function isPrecedenceImpression(row: { kind: string; week: number | null }): boolean {
  return row.kind === 'anchored' && row.week != null;
}

/**
 * PURE — was this ambient placement made within the repeat-cooldown window
 * (still excluded from re-selection), or has it aged out and become eligible
 * again via ambientPool's own least-recently-seen ordering? See
 * AMBIENT_REPEAT_COOLDOWN_DAYS in ambientPool.ts for why this exists: an
 * all-time exclusion permanently exhausts small ambient pools (blog: 89
 * posts, podcast: 24 episodes) for any long-lived account.
 */
export function isWithinAmbientCooldown(servedAt: Date, cooldownDays: number, now: Date = new Date()): boolean {
  return servedAt.getTime() >= now.getTime() - cooldownDays * 24 * 60 * 60 * 1000;
}

/** The minimal card shape `weekStartedForToday` needs — a subset of `FeedCard`. */
export interface WeekGateCard { id: string; type: string; bucket: string; week: number | null; order: number; status: string | null }

/**
 * `order` is scored PER BUCKET, not globally across a week (every bucket's own
 * cards restart at 0) — so comparing raw `order` across buckets is comparing
 * unrelated sequences. Rank by the curriculum's actual pedagogical sequence
 * first (pre_class -> learn -> practice -> build -> reflect -> share ->
 * advance), THEN by order within that bucket. Unknown buckets sort last.
 */
function bucketRank(bucket: string): number {
  const i = (BUCKET_ORDER as readonly string[]).indexOf(bucket);
  return i === -1 ? BUCKET_ORDER.length : i;
}

/**
 * PURE — the student's single "current" week among 1-12: the lowest week
 * number that is NOT fully complete (i.e. has at least one completable card
 * whose status isn't 'completed'). A week with zero completable cards is
 * treated as not-yet-done (never silently skipped). Returns Infinity if every
 * week 1-12 is fully complete.
 */
function currentIncompleteWeek(allCards: WeekGateCard[]): number {
  const weeks = Array.from(new Set(allCards.filter((c) => c.week != null && c.week > 0).map((c) => c.week as number))).sort((a, b) => a - b);
  for (const w of weeks) {
    const completableInWeek = allCards.filter((c) => c.week === w && isCompletableType(c.type));
    const fullyDone = completableInWeek.length > 0 && completableInWeek.every((c) => c.status === 'completed');
    if (!fullyDone) return w;
  }
  return Infinity;
}

/**
 * TODAY-ONLY gate (env.timelineWeekStartGateEnabled): only the student's
 * SINGLE current week (the lowest week 1-12 that isn't fully complete —
 * see `currentIncompleteWeek`) ever shows anything on the Today timeline;
 * every other week 1-12 shows nothing at all, not even its announcement.
 * Week 0 is always exempt (the free onboarding week).
 *
 * Within the current week, the existing same-week self-unlock rule still
 * applies: the week's own "entry card" (the earliest-in-sequence completable
 * card, by bucket then order then id — see `bucketRank`) is always visible so
 * there's something to start; the rest of that week's cards unlock once the
 * student completes >=1 completable card in it. Non-completable types
 * (announcements/events/system) are only ever shown for the current week —
 * they don't get a blanket exemption across all weeks, or every un-started
 * week's "Welcome to Week N!" would clutter Today simultaneously.
 *
 * This is Today-timeline-specific — it narrows what Today displays among
 * cards Classroom already marked 'available'. It never touches a card's
 * `status`/`lock_reason` (that stays governed solely by
 * timelineGatingService.evaluateCardLock) — Classroom is completely
 * unaffected by this function; it isn't called anywhere on that path.
 */
export function weekStartedForToday(card: WeekGateCard, allCards: WeekGateCard[]): boolean {
  if (card.week == null || card.week <= 0) return true;
  if (card.week !== currentIncompleteWeek(allCards)) return false;
  if (!isCompletableType(card.type)) return true;
  const completableInWeek = allCards.filter((c) => c.week === card.week && isCompletableType(c.type));
  const entry = [...completableInWeek].sort((a, b) =>
    (bucketRank(a.bucket) - bucketRank(b.bucket)) || (a.order - b.order) || a.id.localeCompare(b.id))[0];
  if (entry && entry.id === card.id) return true;
  return completableInWeek.some((c) => c.status === 'completed');
}
