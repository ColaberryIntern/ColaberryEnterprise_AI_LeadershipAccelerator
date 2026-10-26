import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPost, fetchPosts, type CommunityPost } from '../../../services/communityApi';
import { BOARD_TABS, BOARD_WALK_MS, POST_CATEGORY, QUESTION_CATEGORY, firstName, noteCount, noteKind, onTab, tiltOf, writeSeen, type BoardTab } from './boardModel';
import { onBoard, type BoardOpen } from './boardApi';
import './communityBoard.css';

/**
 * The Community Board (C30, v7 R3; the prototype's #cboard): a cork dialog. "📌 Community Board", the line, the four tabs, "❓ Ask a
 * question" / "✏️ Post something" opening an inline composer ("Pin it to the board" posts through the existing community endpoint),
 * the notes as pinned paper (questions yellow with answers, posts white with likes, announcements teal; the author's initials and
 * first name), and "Open the full Community feed →". A note opens the Community feed. Failures say so; nothing is claimed.
 */
export function useBoardPosts(enabled: boolean): { posts: CommunityPost[] | null; error: boolean; reload: () => void } {
  const [posts, setPosts] = useState<CommunityPost[] | null>(null);
  const [error, setError] = useState(false);
  const reload = useCallback(() => {
    if (!enabled) return;
    fetchPosts({ limit: 30 }).then((p) => { setPosts(p.posts); setError(false); }).catch(() => setError(true));
  }, [enabled]);
  useEffect(() => { reload(); }, [reload]);
  return { posts, error, reload };
}

/** The community feed's own minimum (backend communitySchemas): said up front so a short post is not a surprise. */
export const MIN_WORDS = 15;
const initials = (n: string) => n.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';

function Composer({ kind, onPosted, onCancel }: { kind: 'q' | 'post'; onPosted: () => void; onCancel: () => void }): React.ReactElement {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); }, [kind]);
  const pin = async () => {
    if (inFlight.current || !body.trim()) return;
    inFlight.current = true; setBusy(true); setMessage('');
    try { await createPost({ body: body.trim(), category: kind === 'q' ? QUESTION_CATEGORY : POST_CATEGORY }); onPosted(); }
    catch (e: unknown) {
      inFlight.current = false; setBusy(false);
      // the feed's own rules (for example "Posts need at least 15 words") are said as the server says them
      const d = (e as { response?: { data?: { details?: { fieldErrors?: { body?: string[] } }; error?: string } } }).response?.data;
      setMessage(d?.details?.fieldErrors?.body?.[0] ?? 'Could not pin it right now. Please try again.');
    }
  };
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  return (
    <div className={`cm-cb-compose is-${kind}`} data-testid="cm-cb-compose">
      <textarea ref={ref} value={body} maxLength={4000} rows={3} onChange={(e) => setBody(e.target.value)}
        placeholder={kind === 'q' ? 'What do you want to ask everyone?' : 'Share something with everyone on campus'} aria-label={kind === 'q' ? 'Your question' : 'Your post'} />
      {message && <p className="cm-cb-msg" role="alert">{message}</p>}
      <div className="cm-cb-row">
        <small className="cm-cb-words" data-testid="cm-cb-words">{words} {words === 1 ? 'word' : 'words'} · posts need at least {MIN_WORDS}</small>
        <button type="button" className="cm-cb-btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="cm-cb-btn pri" disabled={busy || !body.trim()} onClick={pin} data-testid="cm-cb-pin">{busy ? 'Pinning…' : 'Pin it to the board'}</button>
      </div>
    </div>
  );
}

export function CommunityBoard({ compose = null, onClose }: { compose?: 'q' | 'post' | null; onClose: () => void }): React.ReactElement {
  const navigate = useNavigate();
  const [tab, setTab] = useState<BoardTab>('all');
  const [composing, setComposing] = useState<'q' | 'post' | null>(compose);
  const { posts, error, reload } = useBoardPosts(true);
  useEffect(() => { writeSeen(Date.now()); }, []); // opening the board clears the badge
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const go = (route: string) => { onClose(); navigate(route); };
  const shown = posts ? onTab(posts, tab) : [];
  return (
    <div className="cm-cb-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cm-cb" role="dialog" aria-modal="true" aria-labelledby="cm-cb-h" data-testid="cm-cboard">
        <button type="button" className="cm-cb-x" onClick={onClose} aria-label="Close">×</button>
        <h2 id="cm-cb-h"><span aria-hidden="true">📌 </span>Community Board</h2>
        <p className="cm-cb-lead">Posts and questions from everyone on campus. Read anytime, answer anytime. For live conversations, head to Meeting Rooms.</p>
        <div className="cm-cb-tabs" role="tablist">
          {BOARD_TABS.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={`cm-cb-tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)} data-testid={`cm-cb-tab-${k}`}>{label}</button>
          ))}
          <span className="cm-cb-gap" />
          <button type="button" className="cm-cb-btn" onClick={() => setComposing('q')} data-testid="cm-cb-ask">❓ Ask a question</button>
          <button type="button" className="cm-cb-btn" onClick={() => setComposing('post')} data-testid="cm-cb-post">✏️ Post something</button>
        </div>
        {composing && <Composer key={composing} kind={composing} onCancel={() => setComposing(null)} onPosted={() => { setComposing(null); setTab('all'); reload(); }} />}
        {error && <p className="cm-cb-msg" role="status">We can&rsquo;t load the board right now.</p>}
        {!error && posts === null && <p className="cm-cb-muted" role="status">Loading the board&hellip;</p>}
        {posts && !shown.length && <p className="cm-cb-muted">Nothing pinned here yet.</p>}
        <div className="cm-cb-notes" data-testid="cm-cb-notes">
          {shown.map((p) => (
            <button key={p.id} type="button" className={`cm-cb-note is-${noteKind(p)}`} style={{ transform: `rotate(${tiltOf(p.id)}deg)` }}
              onClick={() => go('/portal/community')} data-testid={`cm-cb-note-${p.id}`}>
              <span className="pin" aria-hidden="true" />
              <span className="body">{(p.body || '').slice(0, 180)}</span>
              <span className="by"><i aria-hidden="true">{initials(p.member.display_name)}</i>{firstName(p.member.display_name)}<small>{noteCount(p)}</small></span>
            </button>
          ))}
        </div>
        <button type="button" className="cm-cb-feed" onClick={() => go('/portal/community')} data-testid="cm-cb-feed">Open the full Community feed &rarr;</button>
      </div>
    </div>
  );
}

/** The one host: mounted on the campus home and with the campus layers. A walk-and-open waits for the avatar to arrive. */
export default function CommunityBoardHost({ reduceMotion = false }: { reduceMotion?: boolean }): React.ReactElement | null {
  const [open, setOpen] = useState<BoardOpen | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => onBoard((o) => {
    if (timer.current) window.clearTimeout(timer.current);
    if (o.walk && !reduceMotion) timer.current = window.setTimeout(() => setOpen(o), BOARD_WALK_MS);
    else setOpen(o);
  }), [reduceMotion]);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const close = useCallback(() => setOpen(null), []);
  return open ? <CommunityBoard compose={open.compose ?? null} onClose={close} /> : null;
}
