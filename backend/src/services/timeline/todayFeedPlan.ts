/**
 * todayFeedPlan — the PURE core of the Today Timeline v2 engagement engine.
 * No I/O, no randomness, no DB imports (the AmbientProviderSlug import is
 * type-only and erased at compile), so it is trivially unit-testable and
 * deterministic. The composer (todayFeedComposer.ts) is the I/O shell that fills
 * the slots this planner lays out.
 */
import type { AmbientProviderSlug } from './ambientPool';
import { isCompletableType } from './timelineGatingService';
import { BUCKET_ORDER } from './timelineService';

export type TodayItemKind = 'anchored' | 'ambient';
export interface PlannedSlot { kind: TodayItemKind; provider?: AmbientProviderSlug; }

/**
 * Decide the kind (and ambient provider) for the next `count` feed slots.
 * Cadence = anchored items between ambient injections; providers round-robin and
 * never repeat back-to-back when more than one is available. When anchored is
 * exhausted the remainder is pure ambient (bottomless). `anchoredPlaced` /
 * `ambientPlaced` carry cadence + round-robin continuity across pages.
 */
export function planSlots(opts: {
  count: number;
  anchoredAvailable: number;
  providers: AmbientProviderSlug[];
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
  let lastProvider: AmbientProviderSlug | undefined;

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
 * TODAY-ONLY gate (env.timelineWeekStartGateEnabled): within class curriculum,
 * a week's cards (1-12) show on the Today timeline only once the student has
 * completed >=1 completable card in that same week. Every week always shows
 * its own "entry card" (the earliest-in-sequence completable card in that
 * week, by bucket then order then id) so there's always something to start;
 * non-completable types (announcements/events/system) are never gated by this
 * rule at all. Evaluations/reflections/etc. (reflect/share/advance buckets)
 * can never be mistaken for a week's entry point, since they always rank
 * after pre_class/learn/practice/build.
 *
 * This is Today-timeline-specific — it narrows what Today displays among
 * cards Classroom already marked 'available'. It never touches a card's
 * `status`/`lock_reason` (that stays governed solely by
 * timelineGatingService.evaluateCardLock) — Classroom is completely
 * unaffected by this function; it isn't called anywhere on that path.
 */
export function weekStartedForToday(card: WeekGateCard, allCards: WeekGateCard[]): boolean {
  if (card.week == null || card.week <= 0) return true;
  if (!isCompletableType(card.type)) return true;
  const completableInWeek = allCards.filter((c) => c.week === card.week && isCompletableType(c.type));
  const entry = [...completableInWeek].sort((a, b) =>
    (bucketRank(a.bucket) - bucketRank(b.bucket)) || (a.order - b.order) || a.id.localeCompare(b.id))[0];
  if (entry && entry.id === card.id) return true;
  return completableInWeek.some((c) => c.status === 'completed');
}
