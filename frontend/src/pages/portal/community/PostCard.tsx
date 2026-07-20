import React, { useCallback, useEffect, useState } from 'react';
import Avatar from './Avatar';
import LevelBadge from './LevelBadge';
import { timeAgo, isVideoUrl, youtubeId, youtubeThumb } from './communityUtils';
import {
  fetchComments, createComment, togglePin as apiTogglePin,
  togglePostLike, toggleCommentLike,
  CommunityPost, CommunityComment,
} from '../../../services/communityApi';

const CommentRow: React.FC<{
  comment: CommunityComment;
  isReply?: boolean;
  onLike: (id: string) => void;
  onReply?: (parentId: string) => void;
  onOpenProfile?: (memberId: string) => void;
}> = ({ comment, isReply, onLike, onReply, onOpenProfile }) => (
  <div className={`cm-comment${isReply ? ' reply' : ''}`}>
    <Avatar name={comment.member.display_name} src={comment.member.avatar_url} size="sm"
      onClick={onOpenProfile ? () => onOpenProfile(comment.member.id) : undefined} />
    <div className="cm-comment-body">
      <div className="cm-comment-bubble">
        <div className="cm-comment-name">{comment.member.display_name}</div>
        <div className="cm-comment-text">{comment.body}</div>
      </div>
      <div className="cm-comment-meta">
        <span>{timeAgo(comment.created_at)}</span>
        <button type="button" className={comment.viewer_has_liked ? 'liked' : ''} onClick={() => onLike(comment.id)}>
          {comment.viewer_has_liked ? 'Liked' : 'Like'}{comment.like_count > 0 ? ` (${comment.like_count})` : ''}
        </button>
        {!isReply && onReply && <button type="button" onClick={() => onReply(comment.id)}>Reply</button>}
      </div>
    </div>
  </div>
);

const LockedPostBody: React.FC<{ minLevel: number }> = ({ minLevel }) => (
  <div className="cm-locked-card">
    <span className="cm-locked-ic">
      <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="10" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" /></svg>
    </span>
    <div className="cm-locked-body">
      <LevelBadge level={minLevel} size="sm" />
      <p>This post stays hidden until you reach level {minLevel}.</p>
    </div>
  </div>
);

// Image/video grid from the post's media_urls (Phase 4 — media was stored but
// never rendered). Caps the visible tiles at 4 and shows a "+N" overlay for the
// rest, Facebook-style; the layout is driven by data-count in CSS.
const MediaGrid: React.FC<{ urls: string[] }> = ({ urls }) => {
  if (!urls || urls.length === 0) return null;
  const shown = urls.slice(0, 4);
  const extra = urls.length - shown.length;
  return (
    <div className="cm-media" data-count={Math.min(shown.length, 4)}>
      {shown.map((url, i) => (
        <div className="cm-media-tile" key={url + i}>
          {isVideoUrl(url) ? (
            <video src={url} controls preload="metadata" />
          ) : youtubeId(url) ? (
            <a className="cm-yt" href={url} target="_blank" rel="noopener noreferrer">
              <img src={youtubeThumb(youtubeId(url) as string)} alt="" loading="lazy" />
              <span className="cm-yt-play" aria-hidden="true" />
            </a>
          ) : (
            <img src={url} alt="" loading="lazy" />
          )}
          {i === shown.length - 1 && extra > 0 && <span className="cm-media-more">+{extra}</span>}
        </div>
      ))}
    </div>
  );
};

const PostCard: React.FC<{
  post: CommunityPost;
  myMemberId: string | null;
  onChanged: (updated: CommunityPost) => void;
  onOpenProfile?: (memberId: string) => void;
}> = ({ post, myMemberId, onChanged, onOpenProfile }) => {
  // Initial like state comes from the server (viewer_has_liked), not a hardcoded
  // false — the previous bug reset every post to "unliked" on each load.
  const [liked, setLiked] = useState(post.viewer_has_liked);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [threadOpen, setThreadOpen] = useState(false);
  const [comments, setComments] = useState<CommunityComment[] | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setLiked(post.viewer_has_liked); }, [post.viewer_has_liked]);
  useEffect(() => { setLikeCount(post.like_count); }, [post.like_count]);

  const loadThread = useCallback(async () => {
    const list = await fetchComments(post.id);
    setComments(list);
  }, [post.id]);

  const toggleThread = () => {
    const next = !threadOpen;
    setThreadOpen(next);
    if (next && comments === null) loadThread();
  };

  const doLike = async () => {
    // Optimistic — the server reconciles the true count/flag on response, and
    // we roll back to the exact prior state on failure.
    const prevLiked = liked;
    const prevCount = likeCount;
    setLiked(!prevLiked);
    setLikeCount(prevCount + (prevLiked ? -1 : 1));
    try {
      const r = await togglePostLike(post.id);
      setLiked(r.liked);
      setLikeCount(r.like_count);
    } catch {
      setLiked(prevLiked);
      setLikeCount(prevCount);
    }
  };

  const doCommentLike = async (commentId: string) => {
    try {
      await toggleCommentLike(commentId);
      await loadThread();
    } catch { /* leave thread as-is on failure */ }
  };

  const submitComment = async () => {
    if (!draft.trim() || busy) return;
    setBusy(true);
    try {
      await createComment(post.id, draft.trim(), replyTo || undefined);
      setDraft('');
      setReplyTo(null);
      await loadThread();
      onChanged({ ...post, comment_count: post.comment_count + 1 });
    } catch { /* keep draft so the student doesn't lose their text */ } finally { setBusy(false); }
  };

  const doTogglePin = async () => {
    try {
      const updated = await apiTogglePin(post.id, !post.pinned);
      onChanged(updated);
    } catch { /* no-op — pin stays as-is on failure */ }
  };

  const isAuthor = !!myMemberId && myMemberId === post.member.id;
  const openAuthor = onOpenProfile ? () => onOpenProfile(post.member.id) : undefined;

  return (
    <div className={`fcard${post.pinned ? ' cm-pinned' : ''}`}>
      <div className="fc-head">
        <Avatar name={post.member.display_name} src={post.member.avatar_url} onClick={openAuthor} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="ttl">
            <button type="button" className="cm-author-link" onClick={openAuthor}>{post.member.display_name}</button>
          </div>
          <div className="sub">
            {post.category && <span className="src" style={{ color: 'var(--berry)' }}>{post.category}</span>}
            <span> · {timeAgo(post.created_at)}</span>
          </div>
        </div>
        {post.pinned && <span className="cm-pinned-badge">Pinned</span>}
        {isAuthor && (
          <button type="button" className={`cm-pin${post.pinned ? ' pinned' : ''}`} onClick={doTogglePin} title={post.pinned ? 'Unpin' : 'Pin'}>
            <svg viewBox="0 0 24 24" fill="none"><path d="M12 2v8m0 0-4 4h8l-4-4zm0 8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        )}
      </div>

      {post.locked ? (
        <div className="fc-body"><LockedPostBody minLevel={post.min_level} /></div>
      ) : (
        <>
          {post.body && <div className="fc-body"><p className="cm-post-body">{post.body}</p></div>}
          <MediaGrid urls={post.media_urls} />
        </>
      )}

      {!post.locked && (
        <div className="fc-foot">
          <button className={`like${liked ? ' liked' : ''}`} onClick={doLike} type="button" aria-pressed={liked} aria-label="Like">
            <svg viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'}><path d="M12 21s-7-4.5-9.5-9C.8 8.5 2.5 5 6 5c2 0 3.2 1.3 4 2.5C10.8 6.3 12 5 14 5c3.5 0 5.2 3.5 3.5 7C19 16.5 12 21 12 21z" stroke="currentColor" strokeWidth="2" /></svg>
            <span>{likeCount}</span>
          </button>
          <button className="cmt" type="button" aria-label="Comment" aria-expanded={threadOpen} onClick={toggleThread}>
            <svg viewBox="0 0 24 24" fill="none"><path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
            <span>{post.comment_count > 0 ? `${post.comment_count} comment${post.comment_count === 1 ? '' : 's'}` : 'Comment'}</span>
          </button>
        </div>
      )}

      {threadOpen && !post.locked && (
        <div className="cm-thread">
          {comments === null && <div className="cm-empty">Loading…</div>}
          {comments !== null && comments.length === 0 && <div className="cm-empty">No comments yet — be the first to reply.</div>}
          {comments?.map((c) => (
            <React.Fragment key={c.id}>
              <CommentRow comment={c} onLike={doCommentLike} onReply={setReplyTo} onOpenProfile={onOpenProfile} />
              {c.replies.map((r) => <CommentRow key={r.id} comment={r} isReply onLike={doCommentLike} onOpenProfile={onOpenProfile} />)}
            </React.Fragment>
          ))}
          <div className="cm-comment-input">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitComment(); }}
              placeholder={replyTo ? 'Write a reply…' : 'Write a comment…'}
              maxLength={5000}
              aria-label={replyTo ? 'Write a reply' : 'Write a comment'}
            />
            <button type="button" onClick={submitComment} disabled={busy || !draft.trim()}>
              {replyTo ? 'Reply' : 'Post'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PostCard;
