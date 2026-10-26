import React, { useEffect, useState } from 'react';
import { runtimeApi, type CardComment } from './runtimeApi';

/**
 * The cohort comment thread every card type carries in its workspace, newest first. Lives in the right rail for every card, so
 * the centre is a single clean scroll. Lifted out of RuntimeWorkspace unchanged when the page passed the 500-line ceiling
 * (Campus C19). Comments are optional: a failed load shows the empty thread, a failed post keeps the draft in the input.
 */
export default function RuntimeComments({ cardId, postId }: { cardId: string; postId: string }): React.ReactElement {
  const [comments, setComments] = useState<CardComment[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setComments([]);
    runtimeApi.comments(cardId).then((r) => { if (alive) setComments(r.comments); }).catch(() => { /* comments are optional */ });
    return () => { alive = false; };
  }, [cardId]);

  const postComment = async () => {
    const body = commentInput.trim();
    if (!body) return;
    setBusy(true);
    try {
      const r = await runtimeApi.comment(postId, body);
      setComments((c) => [r.comment, ...c]);   // newest first
      setCommentInput('');
    } catch { /* keep the draft in the input */ } finally { setBusy(false); }
  };

  return (
    <section className="rt-comments rt-comments--rail">
      <div className="rt-lab">Comments</div>
      <div className="rt-cpost">
        <input className="rt-in" value={commentInput} onChange={(e) => setCommentInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && commentInput.trim() && postComment()} placeholder="Share a thought with your cohort…" />
        <button className="rt-btn pri" disabled={busy || !commentInput.trim()} onClick={postComment}>Post</button>
      </div>
      {comments.length === 0
        ? <p className="rt-muted" style={{ margin: '8px 2px' }}>No comments yet — be the first.</p>
        : comments.map((cm) => (
            <div key={cm.id} className="rt-comment">
              <div className="rt-cwho"><b>{cm.mine ? 'You' : cm.author}</b><span>{new Date(cm.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></div>
              <p>{cm.body}</p>
            </div>
          ))}
    </section>
  );
}
