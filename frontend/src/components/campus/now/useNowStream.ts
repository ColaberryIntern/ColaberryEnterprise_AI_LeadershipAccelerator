import { useCallback, useEffect, useRef, useState } from 'react';
import { markBoardSeen, type BoardPost, type Lane } from '../board/boardData';
import { clearLegacySeen, readSeen } from '../board/boardModel';
import { getSince, getStream, type StreamResponse } from './nowApi';
import { appendPage, insertNew, newestOthers } from './nowModel';

/**
 * The Colaberry Now stream's data (Campus v20 N2, Basecamp C133): the first page for a lane and search, older pages by cursor, the
 * held "new posts" for the pill (polled every 20 s on Everything with no search; they never move the list until shown), and the
 * once-per-opening seen mark (the v14 board's rule, so "new since you looked" stays true across devices).
 * A failed background call keeps what is on screen and is logged with its class.
 */
export const SINCE_POLL_MS = 20_000;
const SEARCH_MS = 250;

export function logNow(event: string, err: unknown): void {
  console.warn(JSON.stringify({ level: 'warn', service: 'campus', event, outcome: 'failure', error_class: (err as { name?: string })?.name || 'Error' }));
}

export function useNowStream() {
  const [lane, setLane] = useState<Lane>('all');
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  const [head, setHead] = useState<StreamResponse | null>(null);
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState<BoardPost[]>([]);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [firstNew, setFirstNew] = useState<number | null>(null);
  const marked = useRef(false);

  useEffect(() => { const id = window.setTimeout(() => setQ(query), SEARCH_MS); return () => window.clearTimeout(id); }, [query]);

  const take = (d: StreamResponse) => { setHead(d); setPosts(d.posts); setCursor(d.next_cursor); setPending([]); setError(false); };
  const load = useCallback(async (): Promise<void> => {
    try { take(await getStream({ lane, q })); } catch (err) { setError(true); logNow('colaberry_now_stream_failed', err); }
  }, [lane, q]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!head || marked.current) return;
    marked.current = true;
    setSeenAt(head.new_since.at);
    setFirstNew(head.new_since.count);
    const legacy = readSeen();
    const migrate = !head.new_since.at && legacy ? markBoardSeen({ at: new Date(legacy).toISOString(), migrate: true }) : Promise.resolve(null);
    migrate.catch(() => null).then(() => { clearLegacySeen(); return markBoardSeen(); }).catch((err) => logNow('colaberry_now_seen_failed', err));
  }, [head]);

  const shown = useRef<BoardPost[][]>([]);
  shown.current = [head?.pinned ?? [], posts, pending];
  useEffect(() => {
    if (lane !== 'all' || q) return undefined;
    const id = window.setInterval(() => {
      const after = newestOthers(shown.current);
      if (!after) return;
      getSince(after).then((r) => { if (r.posts.length) setPending((p) => insertNew(p, r.posts)); }).catch((err) => logNow('colaberry_now_since_failed', err));
    }, SINCE_POLL_MS);
    return () => window.clearInterval(id);
  }, [lane, q]);

  const showPending = () => { setPosts((p) => insertNew(p, pending)); setPending([]); };

  // one older-page request at a time (a scroll can fire on the list and the column in the same frame)
  const inFlight = useRef(false);
  const loadMore = useCallback(async (): Promise<boolean> => {
    if (!cursor || inFlight.current) return true;
    inFlight.current = true;
    setLoadingMore(true);
    try {
      const d = await getStream({ lane, q, cursor });
      setPosts((p) => appendPage(p, d.posts)); setCursor(d.next_cursor);
      return true;
    } catch (err) { logNow('colaberry_now_older_failed', err); return false; } finally { inFlight.current = false; setLoadingMore(false); }
  }, [cursor, lane, q]);

  /** After your own post: back to Everything from the top. Returns your newest post's id (for the glow), or null. */
  const reloadAfterPost = async (): Promise<string | null> => {
    setLane('all'); setQuery(''); setQ('');
    try { const d = await getStream({}); take(d); return d.posts.find((p) => p.mine)?.id ?? null; } catch (err) { logNow('colaberry_now_stream_failed', err); return null; }
  };
  const patch = (p: BoardPost) => setPosts((xs) => xs.map((x) => (x.id === p.id ? p : x)));

  return { lane, setLane, query, setQuery, q, head, posts, cursor, loadingMore, error, pending, seenAt, firstNew, showPending, loadMore, reloadAfterPost, patch };
}
