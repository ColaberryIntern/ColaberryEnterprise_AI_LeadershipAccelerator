import React, { useEffect, useRef, useState } from 'react';
import { createComment, fetchComments, togglePostLike, type CommunityComment } from '../../../services/communityApi';
import { markBoardSeen, type BoardPost } from './boardData';
import { Age, Avatar, Chip } from './BoardNotes';
import { firstName } from './boardTime';

/**
 * Read and reply without leaving the campus (Campus v14 B3, Basecamp C68): a drawer on the right of the board. The full post, the
 * ritual's reaction (togglePostLike), Open in the Community feed, the replies (fetchComments) and a reply box (createComment; the
 * server's own words for rate-limit and length errors). Opening one of your own posts marks it seen on the server, which clears its
 * new replies. Esc is handled by the board (the drawer closes first); focus moves in here and the board returns it to the note.
 */
export interface DrawerProps { p: BoardPost; now: number; onClose: () => void; onChanged: (p: BoardPost) => void; onFeed: () => void }

const serverWords = (e: unknown, fallback: string): string => {
  const d = (e as { response?: { data?: { details?: { fieldErrors?: { body?: string[] } }; error?: string } } }).response?.data;
  return d?.details?.fieldErrors?.body?.[0] ?? d?.error ?? fallback;
};

export default function BoardDrawer({ p, now, onClose, onChanged, onFeed }: DrawerProps): React.ReactElement {
  const [replies, setReplies] = useState<CommunityComment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [liked, setLiked] = useState({ on: p.viewer_has_liked, count: p.like_count });
  const box = useRef<HTMLDivElement>(null);
  const isQ = p.lane === 'q';

  useEffect(() => { box.current?.focus(); }, [p.id]);
  useEffect(() => {
    let alive = true;
    setReplies(null); setFailed(false);
    fetchComments(p.id).then((c) => { if (alive) setReplies(c); }).catch(() => { if (alive) setFailed(true); });
    if (p.mine && p.new_replies > 0) {
      markBoardSeen({ post_id: p.id }).then(() => onChanged({ ...p, new_replies: 0 })).catch(() => { /* the count clears on the next look */ });
    }
    return () => { alive = false; };
  }, [p.id]); // once per opened post: a like or a reply updates p, and must not refetch the thread

  const react = async () => {
    try {
      const r = await togglePostLike(p.id);
      setLiked({ on: r.liked, count: r.like_count });
      onChanged({ ...p, viewer_has_liked: r.liked, like_count: r.like_count });
    } catch { setMessage('Could not save that right now.'); }
  };
  const send = async () => {
    if (busy || !text.trim()) return;
    setBusy(true); setMessage('');
    try {
      const c = await createComment(p.id, text.trim());
      setReplies((r) => [...(r ?? []), c]);
      setText('');
      onChanged({ ...p, comment_count: p.comment_count + 1 });
    } catch (e) { setMessage(serverWords(e, 'Could not post your reply. Please try again.')); }
    finally { setBusy(false); }
  };

  const reaction = p.ritual?.reaction ?? { emoji: '👍', label: 'Like' };
  return (
    <div className="cb-drawer" data-lane={p.lane} role="dialog" aria-modal="false" aria-labelledby="cb-drawer-h" tabIndex={-1} ref={box} data-testid="cb-drawer">
      <div className="hd">
        <Chip p={p} />
        <h4 id="cb-drawer-h">{p.title}</h4>
        <div className="by"><Avatar p={p.member} size="md" /> <b>{p.member.display_name}</b> · Level {p.member.level} · <Age iso={p.created_at} now={now} /></div>
        <button type="button" className="x" onClick={onClose} aria-label="Close the thread" data-testid="cb-drawer-close">×</button>
      </div>
      <div className="bd">
        {p.locked
          ? <p className="txt">This note unlocks at level {p.min_level}.</p>
          : <p className="txt" data-testid="cb-drawer-body">{p.body}</p>}
        <div className="acts">
          <button type="button" className={`cb-btn${liked.on ? ' on' : ''}`} onClick={react} aria-pressed={liked.on} data-testid="cb-react">
            {reaction.emoji} {reaction.label} · {liked.count}
          </button>
          <button type="button" className="cb-btn" onClick={onFeed} data-testid="cb-open-feed">Open in the Community feed ↗</button>
        </div>
        <h5 className="cb-replies-h">{replies && replies.length ? `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}` : 'No replies yet'}{replies && !replies.length && isQ && <small> · Be the first to answer</small>}</h5>
        {failed && <p className="cb-msg" role="status">Replies are not available right now.</p>}
        {replies === null && !failed && <p className="cb-muted" role="status">Loading replies…</p>}
        {(replies ?? []).map((c) => (
          <div className="cb-reply" key={c.id} data-testid="cb-reply">
            <Avatar p={{ id: c.member.id, display_name: c.member.display_name, avatar_url: c.member.avatar_url ?? null, level: c.member.level }} />
            <div><b>{firstName(c.member.display_name)}</b><Age iso={c.created_at} now={now} /><p>{c.body}</p></div>
          </div>
        ))}
      </div>
      {message && <p className="cb-msg" role="alert">{message}</p>}
      <div className="rbox">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void send(); } }}
          placeholder={isQ ? 'Write an answer…' : 'Write a reply…'} aria-label={isQ ? 'Your answer' : 'Your reply'} maxLength={2000} data-testid="cb-reply-input" />
        <button type="button" className="cb-btn pri" onClick={send} disabled={busy || !text.trim()} data-testid="cb-reply-send">{busy ? 'Sending…' : 'Reply'}</button>
      </div>
    </div>
  );
}
