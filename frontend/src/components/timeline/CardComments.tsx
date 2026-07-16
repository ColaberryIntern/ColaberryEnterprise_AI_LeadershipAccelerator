import React, { useEffect, useState } from 'react';
import portalApi from '../../utils/portalApi';
import './cardComments.css';

/**
 * CardComments — the class comment thread under a Timeline card (FB-style):
 * every enrolled student reads the same thread and can post to it. Toggled by
 * the feed card's "Comment" button; the SAME thread the Runtime workspace
 * shows beside the AI Mentor (same endpoint + data, newest first).
 * Self-fetching: GET/POST /api/portal/classroom/cards/:id/comments.
 */

interface CommentRow { id: string; author: string; mine: boolean; body: string; created_at: string }

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

const CardComments: React.FC<{ cardId: string; title?: string }> = ({ cardId, title = 'Class comments' }) => {
  const [rows, setRows] = useState<CommentRow[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setRows(null); setError('');
    portalApi.get(`/api/portal/classroom/cards/${cardId}/comments`)
      .then((r) => { if (alive) setRows(r.data?.comments || []); })
      .catch(() => { if (alive) { setRows([]); setError('Couldn’t load comments.'); } });
    return () => { alive = false; };
  }, [cardId]);

  const post = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true); setError('');
    try {
      const r = await portalApi.post(`/api/portal/classroom/cards/${cardId}/comments`, { body });
      // The thread is newest-first (matches the workspace) — prepend.
      if (r.data?.comment) setRows((rs) => [r.data.comment, ...(rs || [])]);
      setText('');
    } catch {
      setError('Couldn’t post your comment — try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tlc">
      <div className="tlc-h">{title}{rows && rows.length > 0 ? ` · ${rows.length}` : ''}</div>
      {rows === null ? (
        <div className="tlc-empty">Loading comments…</div>
      ) : rows.length === 0 ? (
        <div className="tlc-empty">No comments yet — start the conversation.</div>
      ) : (
        <div className="tlc-list">
          {rows.map((c) => (
            <div key={c.id} className={`tlc-item${c.mine ? ' mine' : ''}`}>
              <span className="tlc-av" aria-hidden="true">{(c.author || 'S')[0].toUpperCase()}</span>
              <div className="tlc-bubble">
                <div className="tlc-meta"><b>{c.mine ? 'You' : c.author}</b> · {timeAgo(c.created_at)}</div>
                <div className="tlc-body">{c.body}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="tlc-row">
        <input
          className="tlc-in"
          value={text}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') post(); }}
          placeholder="Write a comment…"
          aria-label="Write a comment"
        />
        <button type="button" className="tlc-btn" disabled={busy || !text.trim()} onClick={post}>{busy ? '…' : 'Post'}</button>
      </div>
      {error && <div className="tlc-err">{error}</div>}
    </div>
  );
};

export default CardComments;
