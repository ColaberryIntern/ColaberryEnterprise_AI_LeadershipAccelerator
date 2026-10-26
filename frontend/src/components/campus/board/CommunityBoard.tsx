import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBoard, markBoardSeen, type BoardPost, type BoardResponse, type Lane, type PostLane } from './boardData';
import { BOARD_WALK_MS, clearLegacySeen, readSeen } from './boardModel';
import { onBoard, type BoardOpen } from './boardApi';
import { laneMeta, LANE_META, shortCentral } from './boardTime';
import { Everything, Section, YourNotes } from './BoardViews';
import BoardDrawer from './BoardDrawer';
import BoardComposer, { type ComposeType } from './BoardComposer';
import './communityBoard.css';

/**
 * The Community Board 2.0 (Campus v14 B2-B5, Basecamp C67-C71; the prototype's #cboard in docs/design/campus/colaberry-campus-v14.html):
 * a wide cork dialog. Header (n new since you looked, total notes, search debounced 250 ms, one Add a note, the Community page),
 * this week's ritual bar (hidden without a cohort week), the Sections column (counts, red new dots, Questions "n open", Your notes
 * "n new"; a row of chips on phones), and the middle column (Everything / a section / Your notes). Notes open the thread drawer.
 *
 * "New since" lives on the server: the board is marked seen after it loads (the header keeps showing what was new on THIS look), and
 * the old localStorage mark is migrated once (only when the server has none). Ages refresh every 60 s. Esc closes the drawer first.
 */
const SEARCH_MS = 250;
const TICK_MS = 60_000;

export function CommunityBoard({ compose = null, onClose }: { compose?: 'q' | 'post' | null; onClose: () => void }): React.ReactElement {
  const navigate = useNavigate();
  const [lane, setLane] = useState<Lane>('all');
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  const [data, setData] = useState<BoardResponse | null>(null);
  const [error, setError] = useState(false);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [older, setOlder] = useState<{ posts: BoardPost[]; next: string | null; started: boolean }>({ posts: [], next: null, started: false });
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [open, setOpen] = useState<BoardPost | null>(null);
  const [composing, setComposing] = useState<ComposeType | null>(compose === 'q' ? 'q' : compose === 'post' ? 'post' : null);
  const [glowId, setGlowId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const opener = useRef<HTMLElement | null>(null);
  const main = useRef<HTMLDivElement>(null);
  const marked = useRef(false);

  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), TICK_MS); return () => window.clearInterval(id); }, []);
  useEffect(() => { const id = window.setTimeout(() => setQ(query), SEARCH_MS); return () => window.clearTimeout(id); }, [query]);

  const load = useCallback(async (): Promise<void> => {
    try {
      const d = await getBoard({ lane, q });
      setData(d); setError(false); setOlder({ posts: [], next: null, started: false });
    } catch { setError(true); }
  }, [lane, q]);
  useEffect(() => { void load(); }, [load]);

  // Once per opening: keep this look's "new since", migrate the old browser mark, then mark the board seen on the server.
  useEffect(() => {
    if (!data || marked.current) return;
    marked.current = true;
    setSeenAt(data.new_since.at);
    const legacy = readSeen();
    const migrate = !data.new_since.at && legacy ? markBoardSeen({ at: new Date(legacy).toISOString(), migrate: true }) : Promise.resolve(null);
    migrate.catch(() => null).then(() => { clearLegacySeen(); return markBoardSeen(); }).catch(() => { /* the next look marks it */ });
  }, [data]);

  const closeDrawer = useCallback(() => { setOpen(null); window.setTimeout(() => opener.current?.focus(), 0); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; if (open) closeDrawer(); else onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, closeDrawer]);

  const openPost = (p: BoardPost) => { opener.current = document.activeElement as HTMLElement | null; setOpen(p); };
  const patch = (p: BoardPost) => {
    setOpen((o) => (o && o.id === p.id ? p : o));
    setData((d) => {
      if (!d) return d;
      const before = [...d.fresh, ...d.this_week, ...d.last_week, ...d.older.posts].find((x) => x.id === p.id)?.new_replies ?? 0;
      const up = (xs: BoardPost[]) => xs.map((x) => (x.id === p.id ? p : x));
      return {
        ...d, my_new_replies: Math.max(0, d.my_new_replies - (before - p.new_replies)),
        pinned: up(d.pinned), unanswered: up(d.unanswered), fresh: up(d.fresh), this_week: up(d.this_week), last_week: up(d.last_week),
        older: { ...d.older, posts: up(d.older.posts) },
      };
    });
  };
  const loadOlder = async () => {
    setLoadingOlder(true);
    try {
      const d = await getBoard({ lane, q, olderCursor: older.started ? older.next : '' });
      setOlder((o) => ({ posts: [...o.posts, ...d.older.posts], next: d.older.next_cursor, started: true }));
    } catch { setToast('Could not load older notes right now.'); }
    finally { setLoadingOlder(false); }
  };
  const posted = async (into: PostLane) => {
    setComposing(null); setLane('all'); setQuery(''); setQ('');
    main.current?.scrollTo?.({ top: 0 });
    try {
      const d = await getBoard({});
      setData(d);
      const mine = d.fresh.find((p) => p.mine);
      if (mine) { setGlowId(mine.id); window.setTimeout(() => setGlowId(null), 3400); }
    } catch { /* the post is saved; the board shows it on the next load */ }
    setToast(`📌 Pinned to the top of Fresh and filed in ${laneMeta(into).label}. You’ll get a notification when someone replies.`);
    window.setTimeout(() => setToast(''), 6000);
  };
  const toFeed = () => { onClose(); navigate('/portal/community'); };

  const ritual = data?.week_ritual ?? null;
  const viewProps = data ? {
    lane, data, now, seenAt, glowId, older: older.posts, olderCursor: older.started ? older.next : 'start', loadingOlder,
    onOpen: openPost, onLane: setLane, onOlder: loadOlder,
  } : null;
  return (
    <div className="cm-cb-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cm-cb cb2" role="dialog" aria-modal="true" aria-labelledby="cm-cb-h" data-testid="cm-cboard">
        <button type="button" className="cm-cb-x" onClick={onClose} aria-label="Close">×</button>
        <header className="cb-head">
          <div className="ttl">
            <h2 id="cm-cb-h"><span aria-hidden="true">📌 </span>Community Board</h2>
            {data && (
              <p className="sub" data-testid="cb-status">
                {seenAt ? <>{data.new_since.count ? <b>{data.new_since.count} new</b> : 'Nothing new'} since you looked on {shortCentral(seenAt)} · </> : null}
                {data.counts.all} notes from everyone on campus
              </p>
            )}
          </div>
          <input className="cb-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="🔍 Search notes" aria-label="Search the board" data-testid="cb-search" />
          <button type="button" className="cb-add" onClick={() => setComposing('q')} data-testid="cb-add">＋ Add a note</button>
          <button type="button" className="cb-feedlink" onClick={toFeed} data-testid="cm-cb-feed">Open the Community page ↗</button>
        </header>
        {ritual && (
          <div className="cb-ritual" data-testid="cb-ritual">
            <span className="ic" aria-hidden="true">{ritual.ritual.icon}</span>
            <span className="tx"><b>This week · Week {ritual.week} · {ritual.ritual.name}</b>{ritual.ritual.ask}<small className="posted"> · {ritual.posted} posted this week</small></span>
            <button type="button" className="cb-btn gold" onClick={() => setComposing('ritual')} data-testid="cb-ritual-add">Add yours</button>
          </div>
        )}
        <div className="cb-body">
          <nav className="cb-lanes" aria-label="Sections" data-testid="cb-lanes">
            {LANE_META.map((l, i) => (
              <React.Fragment key={l.key}>
                {i === 2 && <span className="lbl">SECTIONS</span>}
                <button type="button" className={lane === l.key ? 'on' : ''} data-lane={l.key} aria-current={lane === l.key ? 'true' : undefined} onClick={() => setLane(l.key)} data-testid={`cb-lane-${l.key}`}>
                  <span className="ic" aria-hidden="true">{l.icon}</span>{l.label}
                  {data && l.key !== 'all' && l.key !== 'mine' && (data.new_since.by_lane[l.key] ?? 0) > 0 && <span className="nw" aria-label="new notes" />}
                  <span className="ct">{!data ? '' : l.key === 'q' && data.open_questions > 0 ? `${data.open_questions} open`
                    : l.key === 'mine' && data.my_new_replies > 0 ? `${data.my_new_replies} new` : data.counts[l.key]}</span>
                </button>
              </React.Fragment>
            ))}
          </nav>
          <div className="cb-main" ref={main}>
            {composing && <BoardComposer initial={composing} weekRitual={ritual} onCancel={() => setComposing(null)} onPosted={posted} />}
            {error && <p className="cb-msg" role="status">We can&rsquo;t load the board right now.</p>}
            {!error && !data && <p className="cb-muted" role="status">Loading the board…</p>}
            {viewProps && (lane === 'all' ? <Everything {...viewProps} /> : lane === 'mine' ? <YourNotes {...viewProps} /> : <Section {...viewProps} />)}
          </div>
        </div>
        {open && <BoardDrawer p={open} now={now} onClose={closeDrawer} onChanged={patch} onFeed={toFeed} />}
        {toast && <div className="cb-toast" role="status" data-testid="cb-toast">{toast}</div>}
      </div>
    </div>
  );
}

/** The one host: mounted on the campus home and with the campus layers. A walk-and-open waits for the avatar to arrive. */
export default function CommunityBoardHost({ reduceMotion = false }: { reduceMotion?: boolean }): React.ReactElement | null {
  const [openReq, setOpenReq] = useState<BoardOpen | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => onBoard((o) => {
    if (timer.current) window.clearTimeout(timer.current);
    if (o.walk && !reduceMotion) timer.current = window.setTimeout(() => setOpenReq(o), BOARD_WALK_MS);
    else setOpenReq(o);
  }), [reduceMotion]);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const close = useCallback(() => setOpenReq(null), []);
  return openReq ? <CommunityBoard compose={openReq.compose ?? null} onClose={close} /> : null;
}
