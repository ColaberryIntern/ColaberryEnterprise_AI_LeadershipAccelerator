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

const PAGE = 10;
const STATUSES: readonly string[] = ['locked', 'available', 'in_progress', 'completed'];
const LABELS: Record<string, string> = { blog: 'Blog', podcast: 'Podcast', testimonial: 'Testimonial' };

function labelFor(type: string): string {
  return LABELS[type] || type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function toStatus(s: string | null): TimelineFeedCard['status'] {
  return STATUSES.includes(s || '') ? (s as TimelineFeedCard['status']) : 'available';
}

/** Adapt a Today feed item into the shape TimelineCard renders. */
function adapt(item: TodayFeedItem): TimelineFeedCard {
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
    points: {},
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
}

const TodayFeedV2: React.FC<Props> = ({ fallbackCards, onOpen, onWorkspace }) => {
  const [mode, setMode] = useState<'loading' | 'v2' | 'fallback'>('loading');
  const [rows, setRows] = useState<Array<{ item: TodayFeedItem; card: TimelineFeedCard }>>([]);
  const [cursor, setCursor] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);
  const [visible, setVisible] = useState(PAGE); // fallback reveal count
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Initial load: prefer the real cursor feed; fall back to the looped classroom
  // when the flag is off (endpoint 404s) or on any error.
  useEffect(() => {
    let alive = true;
    todayFeedApi.list(0, PAGE)
      .then((page) => {
        if (!alive) return;
        setRows(page.items.map((item) => ({ item, card: adapt(item) })));
        setCursor(page.nextCursor);
        setDone(page.exhausted);
        setMode('v2');
      })
      .catch(() => { if (alive) setMode('fallback'); });
    return () => { alive = false; };
  }, []);

  const loadMore = useCallback(async () => {
    if (done || loadingRef.current) return;
    loadingRef.current = true;
    setError(false);
    try {
      const page = await todayFeedApi.list(cursor, PAGE);
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
  }, [cursor, done]);

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
            <TimelineCard key={`${c.id}-${i}`} card={c} onOpen={onOpen} onWorkspace={onWorkspace} likes={6 + ((i * 7) % 13)} />
          ))
        : <div className="fc-empty">Loading your feed…</div>)}

      <div ref={sentinelRef} style={{ height: 1 }} />
    </div>
  );
};

export default TodayFeedV2;
