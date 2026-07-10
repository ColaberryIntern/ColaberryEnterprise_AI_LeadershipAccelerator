import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PortalShell from '../today/PortalShell';
import '../today/TodayShell.css';
import '../feed/feed.css';
import './community.css';
import {
  fetchPosts, createPost, togglePin as apiTogglePin, fetchComments, createComment,
  togglePostLike, toggleCommentLike, fetchMyProfile, fetchMembers, pingPresence,
  CommunityPost, CommunityComment, CommunityMemberProfile, COMMUNITY_CATEGORIES,
} from '../../../services/communityApi';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

const CommentRow: React.FC<{
  comment: CommunityComment;
  isReply?: boolean;
  onLike: (id: string) => void;
  onReply?: (parentId: string) => void;
}> = ({ comment, isReply, onLike, onReply }) => (
  <div className={`cm-comment${isReply ? ' reply' : ''}`}>
    <span className="cm-avatar sm">{initials(comment.member.display_name)}</span>
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

const PostCard: React.FC<{
  post: CommunityPost;
  myMemberId: string | null;
  onChanged: (updated: CommunityPost) => void;
}> = ({ post, myMemberId, onChanged }) => {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [threadOpen, setThreadOpen] = useState(false);
  const [comments, setComments] = useState<CommunityComment[] | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

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
    setLiked((v) => !v);
    setLikeCount((n) => n + (liked ? -1 : 1));
    try {
      const r = await togglePostLike(post.id);
      setLiked(r.liked);
      setLikeCount(r.like_count);
    } catch {
      setLiked(liked);
      setLikeCount(post.like_count);
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

  return (
    <div className="fcard">
      <div className="fc-head">
        <span className="cm-avatar">{initials(post.member.display_name)}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="ttl">{post.member.display_name}</div>
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

      <div className="fc-body"><p className="cm-post-body">{post.body}</p></div>

      <div className="fc-foot">
        <button className={`like${liked ? ' liked' : ''}`} onClick={doLike} type="button" aria-label="Like">
          <svg viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'}><path d="M12 21s-7-4.5-9.5-9C.8 8.5 2.5 5 6 5c2 0 3.2 1.3 4 2.5C10.8 6.3 12 5 14 5c3.5 0 5.2 3.5 3.5 7C19 16.5 12 21 12 21z" stroke="currentColor" strokeWidth="2" /></svg>
          <span>{likeCount}</span>
        </button>
        <button className="cmt" type="button" aria-label="Comment" onClick={toggleThread}>
          <svg viewBox="0 0 24 24" fill="none"><path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
          <span>{post.comment_count > 0 ? `${post.comment_count} comment${post.comment_count === 1 ? '' : 's'}` : 'Comment'}</span>
        </button>
      </div>

      {threadOpen && (
        <div className="cm-thread">
          {comments === null && <div className="cm-empty">Loading…</div>}
          {comments !== null && comments.length === 0 && <div className="cm-empty">No comments yet — be the first to reply.</div>}
          {comments?.map((c) => (
            <React.Fragment key={c.id}>
              <CommentRow comment={c} onLike={doCommentLike} onReply={setReplyTo} />
              {c.replies.map((r) => <CommentRow key={r.id} comment={r} isReply onLike={doCommentLike} />)}
            </React.Fragment>
          ))}
          <div className="cm-comment-input">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitComment(); }}
              placeholder={replyTo ? 'Write a reply…' : 'Write a comment…'}
              maxLength={5000}
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

const CommunityPage: React.FC = () => {
  const [posts, setPosts] = useState<CommunityPost[] | null>(null);
  const [category, setCategory] = useState<string>('');
  const [draft, setDraft] = useState('');
  const [draftCategory, setDraftCategory] = useState<string>(COMMUNITY_CATEGORIES[0]);
  const [posting, setPosting] = useState(false);
  const [myProfile, setMyProfile] = useState<CommunityMemberProfile | null>(null);
  const [members, setMembers] = useState<CommunityMemberProfile[] | null>(null);
  const pingRef = useRef<number | null>(null);

  const loadPosts = useCallback(async (cat: string) => {
    const list = await fetchPosts(cat || undefined);
    setPosts(list);
  }, []);

  useEffect(() => { loadPosts(category); }, [category, loadPosts]);

  useEffect(() => {
    fetchMyProfile().then(setMyProfile).catch(() => {});
    fetchMembers().then(setMembers).catch(() => {});
  }, []);

  // Lite poll-presence: ping on mount, then every 45s while this tab is open.
  useEffect(() => {
    const ping = () => { pingPresence().catch(() => {}); };
    ping();
    pingRef.current = window.setInterval(ping, 45_000);
    return () => { if (pingRef.current) window.clearInterval(pingRef.current); };
  }, []);

  const submitPost = async () => {
    if (!draft.trim() || posting) return;
    setPosting(true);
    try {
      await createPost({ body: draft.trim(), category: draftCategory });
      setDraft('');
      await loadPosts(category);
    } catch { /* keep draft on failure so nothing is lost */ } finally { setPosting(false); }
  };

  const handlePostChanged = (updated: CommunityPost) => {
    setPosts((prev) => (prev ? prev.map((p) => (p.id === updated.id ? updated : p)) : prev));
  };

  const leaderboard = useMemo(() => (members || []).slice(0, 10), [members]);

  return (
    <PortalShell>
      <div className="page-h">
        <div className="crumbs0">Belong</div>
        <h1>Community</h1>
        <div className="sub">Post a win, ask for help, or cheer someone on — everyone in your cohort is here.</div>
      </div>

      <div className="te-grid">
        <div>
          <div className="te-card cm-composer">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Share something with your cohort…"
              maxLength={10000}
            />
            <div className="cm-composer-row">
              <select value={draftCategory} onChange={(e) => setDraftCategory(e.target.value)}>
                {COMMUNITY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <span className="spacer" />
              <button type="button" className="te-btn cherry sm" onClick={submitPost} disabled={posting || !draft.trim()}>
                Post
              </button>
            </div>
          </div>

          <div className="te-feed-filter" style={{ marginTop: 16 }}>
            <span className={`fchip${category === '' ? ' active' : ''}`} onClick={() => setCategory('')}>All</span>
            {COMMUNITY_CATEGORIES.map((c) => (
              <span key={c} className={`fchip${category === c ? ' active' : ''}`} onClick={() => setCategory(c)}>{c}</span>
            ))}
          </div>

          <div className="te-feed" style={{ marginTop: 16, maxWidth: 'none' }}>
            {posts === null && <div className="fc-empty">Loading the feed…</div>}
            {posts !== null && posts.length === 0 && (
              <div className="fc-empty">No posts yet in {category || 'this cohort'} — start the conversation.</div>
            )}
            {posts?.map((p) => (
              <PostCard key={p.id} post={p} myMemberId={myProfile?.id ?? null} onChanged={handlePostChanged} />
            ))}
          </div>
        </div>

        <aside className="te-side">
          <div className="te-card te-scard">
            <h3><svg viewBox="0 0 24 24" fill="none"><path d="M12 2l2.6 7.4H22l-6.2 4.6 2.4 7.4L12 16.9 5.8 21.4l2.4-7.4L2 9.4h7.4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg> Leaderboard</h3>
            {leaderboard.length === 0 && <div className="cm-empty">No activity yet</div>}
            {leaderboard.map((m, i) => (
              <div key={m.id} className={`cm-leader-row${myProfile?.id === m.id ? ' me' : ''}`}>
                <span className="cm-leader-rank">{i + 1}</span>
                <span className="cm-avatar sm">{initials(m.display_name)}</span>
                <span className="cm-leader-name">{m.display_name}</span>
                <span className="cm-leader-pts">{m.points} pts</span>
              </div>
            ))}
          </div>

          <div className="te-card te-scard">
            <h3><svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="2" /><path d="M3 19c0-3 3-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M16 7a3 3 0 0 1 0 6M18 19c0-2-1-3.5-2.5-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> Your cohort</h3>
            {members === null && <div className="cm-empty">Loading…</div>}
            {members !== null && members.length === 0 && <div className="cm-empty">No members yet</div>}
            {members?.map((m) => (
              <div key={m.id} className="cm-contact-row">
                <span className="cm-avatar sm">{initials(m.display_name)}</span>
                <span className="cm-contact-name">{m.display_name}</span>
                <span className={`cm-dot ${m.presence}`} title={m.presence} />
              </div>
            ))}
          </div>
        </aside>
      </div>
    </PortalShell>
  );
};

export default CommunityPage;
