/**
 * TodayFeedV2 — the never-ending Today feed (Phase 1b). Consumes the real
 * cursor-paginated backend engine (GET /api/portal/runtime/today): curriculum
 * interleaved with bottomless ambient content, deterministic pagination, and
 * interact-to-hide. Falls back to the looped-classroom feed when the backend
 * flag is OFF (endpoint 404s) so the surface always renders. Reuses TimelineCard
 * for the visual treatment via a TodayFeedItem → TimelineFeedCard adapter.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import TimelineCard, { TimelineFeedCard } from '../../../components/timeline/TimelineCard';
import { todayFeedApi, type TodayFeedItem } from './todayFeedApi';
import { onCardCollected } from '../../../services/pointsFx';
import { filterExcluded } from './todayFeedDedupe';

const PAGE = 10;
// CAPE Phase 5 defense-in-depth (design doc §10, §16 Phase 5): if excluding
// the Today Plan's refs from a fetched page drops it below PAGE, fetch up to
// this many EXTRA rounds to backfill — bounded so a pathological all-excluded
// run can never spin unbounded, mirroring todayFeedComposer.getTodayPage's
// own `guard++ < 6` server-side bound.
const MAX_BACKFILL_ROUNDS = 3;
const STATUSES: readonly string[] = ['locked', 'available', 'in_progress', 'completed'];
const LABELS: Record<string, string> = { blog: 'Blog', podcast: 'Podcast', testimonial: 'Testimonial' };

function labelFor(type: string): string {
  return LABELS[type] || type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function toStatus(s: string | null): TimelineFeedCard['status'] {
  return STATUSES.includes(s || '') ? (s as TimelineFeedCard['status']) : 'available';
}

/** Adapt a Today feed item into the shape TimelineCard renders. Exported so
 * TodayPlanCard.tsx (CAPE Phase 5) can reuse the SAME adapter for the finite
 * Today Plan's cards instead of duplicating this logic. */
export function adapt(item: TodayFeedItem): TimelineFeedCard {
  return {
    id: item.card_id ?? item.ref,
    type: item.type,
    student_label: labelFor(item.type),
    render_band: item.render_band,
    title: item.title ?? item.subtitle ?? labelFor(item.type),
    subtitle: item.subtitle ?? null,
    description: item.description ?? null,
    week: item.week ?? null,
    bucket: 'learn',
    order: item.position,
    difficulty: 'core',
    estimated_time: item.estimated_time ?? null,
    points: item.points ?? {},
    competencies: [],
    status: toStatus(item.status),
    quiz_score: null,
    completed_at: null,
    video: item.video,
    image: item.image ?? null,
    content: item.content,
    blog: item.blog,
    type_thumbnail: null,
    capabilities: [],
    author: item.author ?? null,
  };
}

interface Props {
  fallbackCards: TimelineFeedCard[];
  onOpen: (card: TimelineFeedCard) => void;
  onWorkspace: (card: TimelineFeedCard) => void;
  onComplete?: (card: TimelineFeedCard) => Promise<void> | void;
  /** CAPE Phase 5 (design doc §10, §16 Phase 5) — refs already shown in the
   * finite Today Plan, excluded from every fetched page here so a card never
   * appears in both surfaces on the same load. `undefined`/empty = no-op,
   * byte-identical to pre-Phase-5 behavior. */
  excludeRefs?: Set<string>;
}

const TodayFeedV2: React.FC<Props> = ({ fallbackCards, onOpen, onWorkspace, onComplete, excludeRefs }) => {
  const [mode, setMode] = useState<'loading' | 'v2' | 'fallback'>('loading');
  const [rows, setRows] = useState<Array<{ item: TodayFeedItem; card: TimelineFeedCard }>>([]);
  const [cursor, setCursor] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);
  const [visible, setVisible] = useState(PAGE); // fallback reveal count
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // Per-visit seed: fresh each mount so every visit is a different lineup, but held
  // stable for the whole session so pagination never repeats or skips.
  const seedRef = useRef<number>((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
  // Captured once at mount — TodayShell only mounts this component AFTER
  // `excludeRefs` is fully known (see its `planRefs` gate), so the value is
  // stable for this component's whole lifetime; a ref avoids re-triggering
  // effects on an object identity that never meaningfully changes.
  const excludeRefsRef = useRef(excludeRefs);

  /** Fetch one page starting at `cursor`, filtering out `excludeRefsRef`
   * (CAPE Phase 5 defense-in-depth), backfilling with extra rounds — bounded
   * by MAX_BACKFILL_ROUNDS — when filtering drops the page below PAGE. */
  const fetchFilteredPage = useCallback(async (
    startCursor: number,
    roundsLeft = MAX_BACKFILL_ROUNDS,
  ): Promise<{ items: TodayFeedItem[]; nextCursor: number; exhausted: boolean }> => {
    const page = await todayFeedApi.list(startCursor, PAGE, seedRef.current);
    const filtered = filterExcluded(page.items, excludeRefsRef.current);
    if (filtered.length >= page.items.length || page.exhausted || roundsLeft <= 0) {
      return { items: filtered, nextCursor: page.nextCursor, exhausted: page.exhausted };
    }
    const more = await fetchFilteredPage(page.nextCursor, roundsLeft - 1);
    return { items: [...filtered, ...more.items], nextCursor: more.nextCursor, exhausted: more.exhausted };
  }, []);

  // Initial load: prefer the real cursor feed; fall back to the looped classroom
  // when the flag is off (endpoint 404s) or on any error.
  useEffect(() => {
    let alive = true;
    fetchFilteredPage(0)
      .then((page) => {
        if (!alive) return;
        setRows(page.items.map((item) => ({ item, card: adapt(item) })));
        setCursor(page.nextCursor);
        setDone(page.exhausted);
        setMode('v2');
      })
      .catch(() => { if (alive) setMode('fallback'); });
    return () => { alive = false; };
  }, [fetchFilteredPage]);

  const loadMore = useCallback(async () => {
    if (done || loadingRef.current) return;
    loadingRef.current = true;
    setError(false);
    try {
      const page = await fetchFilteredPage(cursor);
      // Dedup by ref — a repeated page (e.g. a stalled cursor) must not stack
      // duplicate cards.
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.item.ref));
        const fresh = page.items.filter((it) => !seen.has(it.ref)).map((item) => ({ item, card: adapt(item) }));
        return fresh.length ? [...prev, ...fresh] : prev;
      });
      // Stop only on a REAL end: exhausted, empty, or a cursor that fails to
      // advance (which would otherwise re-request the same window forever).
      if (page.exhausted || page.items.length === 0 || page.nextCursor <= cursor) setDone(true);
      else setCursor(page.nextCursor);
    } catch {
      // Recoverable — a transient error must NOT permanently end the feed. Surface
      // a retry; the next scroll (or the button) re-attempts from the same cursor.
      setError(true);
    } finally {
      loadingRef.current = false;
    }
  }, [cursor, done, fetchFilteredPage]);

  // Infinite-scroll sentinel — real pages in v2, reveal-more in fallback.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || mode === 'loading') return;
    const obs = new IntersectionObserver((e) => {
      if (!e[0].isIntersecting) return;
      if (mode === 'v2') void loadMore();
      else setVisible((v) => v + PAGE);
    }, { rootMargin: '500px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [mode, loadMore]);

  const handleOpen = useCallback((card: TimelineFeedCard, ref: string) => {
    void todayFeedApi.interact(ref, 'open').catch(() => { /* interaction is best-effort */ });
    onOpen(card);
  }, [onOpen]);

  // A collected card (from the tile OR the drawer) fires te-card-collected on
  // success; drop its row from the feed after a beat so the celebration plays
  // first. A gated collect throws before the signal, so the card stays put.
  useEffect(() => onCardCollected((id) => {
    window.setTimeout(() => setRows((prev) => prev.filter((r) => r.card.id !== id)), 1400);
  }), []);
  const collectHandler = onComplete;

  const looped: TimelineFeedCard[] = fallbackCards.length
    ? Array.from({ length: Math.min(visible, fallbackCards.length * 12) }, (_, i) => fallbackCards[i % fallbackCards.length])
    : [];

  return (
    <div className="tl-de" data-theme="light">
      {mode === 'loading' && <div className="fc-empty">Loading your feed…</div>}

      {mode === 'v2' && rows.map(({ item, card }, i) => (
        <TimelineCard
          key={`${item.ref}-${i}`}
          card={card}
          onOpen={(c) => handleOpen(c, item.ref)}
          onWorkspace={onWorkspace}
          onComplete={collectHandler}
          likes={6 + ((i * 7) % 13)}
        />
      ))}
      {mode === 'v2' && rows.length === 0 && <div className="fc-empty">Your feed is warming up — check back soon.</div>}
      {mode === 'v2' && done && rows.length > 0 && <div className="fc-empty">You're all caught up for now.</div>}
      {mode === 'v2' && error && !done && (
        <div className="fc-empty">
          Couldn’t load more.{' '}
          <button
            type="button"
            onClick={() => void loadMore()}
            style={{ background: 'none', border: 'none', color: 'inherit', font: 'inherit', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
          >
            Retry
          </button>
        </div>
      )}

      {mode === 'fallback' && (looped.length
        ? looped.map((c, i) => (
            <TimelineCard key={`${c.id}-${i}`} card={c} onOpen={onOpen} onWorkspace={onWorkspace} onComplete={collectHandler} likes={6 + ((i * 7) % 13)} />
          ))
        : <div className="fc-empty">Loading your feed…</div>)}

      <div ref={sentinelRef} style={{ height: 1 }} />
    </div>
  );
};

export default TodayFeedV2;
