import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { BoardPost, PostLane } from '../board/boardData';
import { laneMeta } from '../board/boardTime';
import BoardDrawer from '../board/BoardDrawer';
import NowComposer from './NowComposer';
import NowLaneChips from './NowLaneChips';
import NowPost from './NowPost';
import HappeningStrip from './HappeningStrip';
import { getHappening, getStream, type Happening } from './nowApi';
import { eventWhen, happeningChips, type NowChip } from './nowModel';
import { logNow, useNowStream } from './useNowStream';

export { SINCE_POLL_MS } from './useNowStream';

/**
 * The right column of Colaberry Now: the stream (Campus v20 N2, Basecamp C133; the prototype's .nB). "What's going on", the composer,
 * the v14 section chips, the Happening-now strip, then ONE list, newest first, that never ends (20 more within 160px of the bottom).
 * New posts that arrive while it is open never move the list: a sticky "↑ n new posts" pill holds them until it is tapped (polled
 * every 20 s on Everything; useNowStream). A post opens the v14 thread drawer over this column; Esc closes the drawer first (escapeRef).
 */
export const NEAR_BOTTOM_PX = 160;
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
  const s = useNowStream();
  const [happening, setHappening] = useState<Happening | null>(null);
  const [open, setOpen] = useState<BoardPost | null>(null);
  const [glowId, setGlowId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const list = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), TICK_MS); return () => window.clearInterval(id); }, []);
  const readHappening = useCallback(() => { getHappening().then(setHappening).catch((err) => logNow('colaberry_now_happening_failed', err)); }, []);
  useEffect(readHappening, [readHappening]);
  const flash = (t: string) => { setToast(t); window.setTimeout(() => setToast(''), 6000); };

  const openPost = useCallback((p: BoardPost) => { opener.current = document.activeElement as HTMLElement | null; setOpen(p); }, []);
  const closeDrawer = useCallback(() => { setOpen(null); window.setTimeout(() => opener.current?.focus(), 0); }, []);
  escapeRef.current = () => { if (!open) return false; closeDrawer(); return true; };
  openPostRef.current = (id: string) => {
    const hit = [...(s.head?.pinned ?? []), ...s.posts].find((p) => p.id === id);
    if (hit) { openPost(hit); return; }
    getStream({ lane: 'wins' }).then((d) => { const p = d.posts.find((x) => x.id === id); if (p) openPost(p); })
      .catch((err) => { logNow('colaberry_now_open_post_failed', err); flash('Could not open that post right now.'); });
  };

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX) void s.loadMore().then((ok) => { if (!ok) flash('Could not load older posts right now.'); });
  };
  const posted = async (into: PostLane) => {
    list.current?.scrollTo?.({ top: 0 });
    const mine = await s.reloadAfterPost();
    if (mine) { setGlowId(mine); window.setTimeout(() => setGlowId(null), 3400); }
    readHappening();
    flash(`Posted. It’s at the top of the stream and filed in ${laneMeta(into).label}. You’ll get a notification when someone replies.`);
  };
  const isNew = (p: BoardPost) => !!s.seenAt && !p.mine && p.created_at > s.seenAt;
  const row = (p: BoardPost) => <NowPost key={p.id} p={p} now={now} isNew={isNew(p)} glow={glowId === p.id} onOpen={openPost} />;

  return (
    // on phones the whole column scrolls (colaberryNow.css), so paging listens on both the column and the list
    <section className="cn-b" aria-labelledby="cn-h" data-testid="cn-stream" onScroll={onScroll}>
      <header className="cn-hd">
        <div className="cn-top">
          <div className="cn-ttl">
            <h2 id="cn-h">What’s going on</h2>
            <p className="cn-sub" data-testid="cn-sub">Everything people are posting, newest first. It never ends: keep scrolling.
              {s.firstNew !== null && s.firstNew > 0 && <> <b>{s.firstNew} new</b> since you looked.</>}</p>
          </div>
          <input className="cn-search" type="search" value={s.query} onChange={(e) => s.setQuery(e.target.value)} placeholder="🔍 Search" aria-label="Search the posts" data-testid="cn-search" />
          <button type="button" className="cn-x" onClick={onClose} aria-label="Close Colaberry Now" data-testid="cn-close">✕</button>
        </div>
        <NowComposer me={me} initial={compose === 'q' ? 'q' : 'post'} weekRitual={s.head?.week_ritual ?? null} onPosted={posted} />
        <NowLaneChips head={s.head} lane={s.lane} onLane={s.setLane} />
      </header>
      <HappeningStrip chips={happeningChips(happening, nameOf, eventWhen)} onChip={(c) => { if (c.kind === 'questions') s.setLane('q'); else if (happening) onChip(c, happening); }} />
      <div className="cn-s" ref={list} onScroll={onScroll} data-testid="cn-list">
        {s.pending.length > 0 && (
          <button type="button" className="cn-pill" onClick={() => { s.showPending(); list.current?.scrollTo?.({ top: 0 }); }} data-testid="cn-pill">
            ↑ {s.pending.length} new {s.pending.length === 1 ? 'post' : 'posts'}
          </button>
        )}
        {s.error && <p className="cn-msg" role="status">We can’t load the stream right now.</p>}
        {!s.error && !s.head && <p className="cn-more" role="status">Loading what’s going on…</p>}
        {s.head && s.lane === 'all' && s.head.pinned.map(row)}
        {s.posts.map(row)}
        {s.head && !s.posts.length && !s.head.pinned.length && <p className="cn-more">{s.q ? 'Nothing matches that search.' : 'Nothing here yet. Be the first to post.'}</p>}
        {s.head && s.posts.length > 0 && <p className="cn-more" data-testid="cn-more">{s.loadingMore ? 'Loading older posts…' : s.cursor ? 'Scroll for older posts' : 'You’re all caught up.'}</p>}
      </div>
      {open && <div className="cn-drawer cb2"><BoardDrawer p={open} now={now} onClose={closeDrawer} onChanged={(p) => { setOpen((o) => (o && o.id === p.id ? p : o)); s.patch(p); }} onFeed={onFeed} /></div>}
      {toast && <div className="cn-toast" role="status" data-testid="cn-toast">{toast}</div>}
    </section>
  );
}
