import React, { useCallback, useEffect, useRef, useState } from 'react';
import { markBoardSeen, type BoardPost, type Lane, type PostLane } from '../board/boardData';
import { clearLegacySeen, readSeen } from '../board/boardModel';
import { laneMeta, LANE_META } from '../board/boardTime';
import BoardDrawer from '../board/BoardDrawer';
import NowComposer from './NowComposer';
import NowPost from './NowPost';
import HappeningStrip from './HappeningStrip';
import { getHappening, getSince, getStream, type Happening, type StreamResponse } from './nowApi';
import { appendPage, eventWhen, happeningChips, insertNew, newestOthers, type NowChip } from './nowModel';

/**
 * The right column of Colaberry Now: the stream (Campus v20 N2, Basecamp C133; the prototype's .nB). "What's going on", the composer,
 * the v14 section chips, the Happening-now strip, then ONE list, newest first, that never ends (20 more within 160px of the bottom).
 * New posts that arrive while it is open never move the list: a sticky "↑ n new posts" pill holds them until it is tapped (polled
 * every 20 s on Everything). A post opens the v14 thread drawer over this column; Esc closes the drawer first (escapeRef).
 */
export const SINCE_POLL_MS = 20_000;
export const NEAR_BOTTOM_PX = 160;
const SEARCH_MS = 250;
const TICK_MS = 60_000;

export interface NowStreamProps {
  me: string;
  /** Opened from "Ask a question": the composer starts on Question. */
  compose?: 'q' | 'post' | null;
  onClose: () => void;
  onFeed: () => void;
  nameOf: (area: string) => string | null;
  onChip: (c: NowChip, h: Happening) => void;
  escapeRef: React.MutableRefObject<(() => boolean) | null>;
  openPostRef: React.MutableRefObject<((id: string) => void) | null>;
}

export default function NowStream({ me, compose = null, onClose, onFeed, nameOf, onChip, escapeRef, openPostRef }: NowStreamProps): React.ReactElement {
  const [lane, setLane] = useState<Lane>('all');
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  const [head, setHead] = useState<StreamResponse | null>(null);
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState<BoardPost[]>([]);
  const [happening, setHappening] = useState<Happening | null>(null);
  const [open, setOpen] = useState<BoardPost | null>(null);
  const [glowId, setGlowId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [firstNew, setFirstNew] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const list = useRef<HTMLDivElement>(null);
  const marked = useRef(false);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), TICK_MS); return () => window.clearInterval(id); }, []);
  useEffect(() => { const id = window.setTimeout(() => setQ(query), SEARCH_MS); return () => window.clearTimeout(id); }, [query]);

  const load = useCallback(async (): Promise<StreamResponse | null> => {
    try {
      const d = await getStream({ lane, q });
      setHead(d); setPosts(d.posts); setCursor(d.next_cursor); setPending([]); setError(false);
      return d;
    } catch { setError(true); return null; }
  }, [lane, q]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { getHappening().then(setHappening).catch(() => setHappening(null)); }, []);

  // Once per opening: keep this look's "new since", migrate the old browser mark, then mark the board seen (as the v14 board did).
  useEffect(() => {
    if (!head || marked.current) return;
    marked.current = true;
    setSeenAt(head.new_since.at);
    setFirstNew(head.new_since.count);
    const legacy = readSeen();
    const migrate = !head.new_since.at && legacy ? markBoardSeen({ at: new Date(legacy).toISOString(), migrate: true }) : Promise.resolve(null);
    migrate.catch(() => null).then(() => { clearLegacySeen(); return markBoardSeen(); }).catch(() => { /* the next look marks it */ });
  }, [head]);

  // The pill: on Everything with no search, ask every 20 s for other people's posts newer than the newest one shown.
  const shownRef = useRef<BoardPost[][]>([]);
  shownRef.current = [head?.pinned ?? [], posts, pending];
  useEffect(() => {
    if (lane !== 'all' || q) return undefined;
    const id = window.setInterval(() => {
      const after = newestOthers(shownRef.current);
      if (!after) return;
      getSince(after).then((r) => { if (r.posts.length) setPending((p) => insertNew(p, r.posts)); }).catch(() => { /* next poll */ });
    }, SINCE_POLL_MS);
    return () => window.clearInterval(id);
  }, [lane, q]);

  const showPending = () => {
    setPosts((p) => insertNew(p, pending));
    setPending([]);
    list.current?.scrollTo?.({ top: 0 });
  };

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const d = await getStream({ lane, q, cursor });
      setPosts((p) => appendPage(p, d.posts)); setCursor(d.next_cursor);
    } catch { setToast('Could not load older posts right now.'); }
    finally { setLoadingMore(false); }
  }, [cursor, loadingMore, lane, q]);
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX) void loadMore();
  };

  const openPost = useCallback((p: BoardPost) => { opener.current = document.activeElement as HTMLElement | null; setOpen(p); }, []);
  const closeDrawer = useCallback(() => { setOpen(null); window.setTimeout(() => opener.current?.focus(), 0); }, []);
  escapeRef.current = () => { if (!open) return false; closeDrawer(); return true; };
  openPostRef.current = (id: string) => {
    const hit = [...(head?.pinned ?? []), ...posts].find((p) => p.id === id);
    if (hit) { openPost(hit); return; }
    getStream({ lane: 'wins' }).then((d) => { const p = d.posts.find((x) => x.id === id); if (p) openPost(p); }).catch(() => setToast('Could not open that post right now.'));
  };
  const patch = (p: BoardPost) => {
    setOpen((o) => (o && o.id === p.id ? p : o));
    setPosts((xs) => xs.map((x) => (x.id === p.id ? p : x)));
  };

  const posted = async (into: PostLane) => {
    setLane('all'); setQuery(''); setQ('');
    list.current?.scrollTo?.({ top: 0 });
    try {
      const d = await getStream({});
      setHead(d); setPosts(d.posts); setCursor(d.next_cursor); setPending([]);
      const mine = d.posts.find((p) => p.mine);
      if (mine) { setGlowId(mine.id); window.setTimeout(() => setGlowId(null), 3400); }
    } catch { /* saved; the next load shows it */ }
    getHappening().then(setHappening).catch(() => undefined);
    setToast(`Posted. It’s at the top of the stream and filed in ${laneMeta(into).label}. You’ll get a notification when someone replies.`);
    window.setTimeout(() => setToast(''), 6000);
  };

  const chips = happeningChips(happening, nameOf, eventWhen);
  const isNew = (p: BoardPost) => !!seenAt && !p.mine && p.created_at > seenAt;
  const countOf = (k: Lane): { n: string; small: string } => {
    if (!head) return { n: '', small: '' };
    if (k === 'q') return { n: String(head.counts.q), small: head.open_questions > 0 ? `${head.open_questions} open` : '' };
    if (k === 'mine') return { n: String(head.counts.mine), small: head.my_new_replies > 0 ? `${head.my_new_replies} new` : '' };
    return { n: String(head.counts[k]), small: '' };
  };
  const hasDot = (k: Lane): boolean => !!head && (k === 'mine' ? head.my_new_replies > 0 : (head.new_since.by_lane[k] ?? 0) > 0);

  return (
    <section className="cn-b" aria-labelledby="cn-h" data-testid="cn-stream">
      <header className="cn-hd">
        <div className="cn-top">
          <div className="cn-ttl">
            <h2 id="cn-h">What’s going on</h2>
            <p className="cn-sub" data-testid="cn-sub">Everything people are posting, newest first. It never ends: keep scrolling.
              {firstNew !== null && firstNew > 0 && <> <b>{firstNew} new</b> since you looked.</>}</p>
          </div>
          <input className="cn-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="🔍 Search" aria-label="Search the posts" data-testid="cn-search" />
          <button type="button" className="cn-x" onClick={onClose} aria-label="Close Colaberry Now" data-testid="cn-close">✕</button>
        </div>
        <NowComposer me={me} initial={compose === 'q' ? 'q' : 'post'}weekRitual={head?.week_ritual ?? null} onPosted={posted} />
        <nav className="cn-f" aria-label="Sections" data-testid="cn-lanes">
          {LANE_META.map((l) => {
            const c = countOf(l.key);
            return (
              <button key={l.key} type="button" className={lane === l.key ? 'on' : ''} aria-current={lane === l.key ? 'true' : undefined}
                onClick={() => setLane(l.key)} data-testid={`cn-lane-${l.key}`}>
                <span aria-hidden="true">{l.icon}</span> {l.label} <small>{c.n}{c.small ? ` ${c.small}` : ''}</small>
                {hasDot(l.key) && <span className="cn-dot" aria-label="new posts" data-testid={`cn-dot-${l.key}`} />}
              </button>
            );
          })}
        </nav>
      </header>
      <HappeningStrip chips={chips} onChip={(c) => { if (c.kind === 'questions') setLane('q'); else if (happening) onChip(c, happening); }} />
      <div className="cn-s" ref={list} onScroll={onScroll} data-testid="cn-list">
        {pending.length > 0 && (
          <button type="button" className="cn-pill" onClick={showPending} data-testid="cn-pill">↑ {pending.length} new {pending.length === 1 ? 'post' : 'posts'}</button>
        )}
        {error && <p className="cn-msg" role="status">We can’t load the stream right now.</p>}
        {!error && !head && <p className="cn-more" role="status">Loading what’s going on…</p>}
        {head && lane === 'all' && head.pinned.map((p) => <NowPost key={p.id} p={p} now={now} isNew={isNew(p)} glow={false} onOpen={openPost} />)}
        {posts.map((p) => <NowPost key={p.id} p={p} now={now} isNew={isNew(p)} glow={glowId === p.id} onOpen={openPost} />)}
        {head && !posts.length && !head.pinned.length && <p className="cn-more">{q ? 'Nothing matches that search.' : 'Nothing here yet. Be the first to post.'}</p>}
        {head && posts.length > 0 && <p className="cn-more" data-testid="cn-more">{loadingMore ? 'Loading older posts…' : cursor ? 'Scroll for older posts' : 'You’re all caught up.'}</p>}
      </div>
      {open && <div className="cn-drawer"><BoardDrawer p={open} now={now} onClose={closeDrawer} onChanged={patch} onFeed={onFeed} /></div>}
      {toast && <div className="cn-toast" role="status" data-testid="cn-toast">{toast}</div>}
    </section>
  );
}
