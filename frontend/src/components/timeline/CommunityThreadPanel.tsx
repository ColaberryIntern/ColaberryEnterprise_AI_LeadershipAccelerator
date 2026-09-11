import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchPost, fetchComments, createComment, togglePostLike, toggleCommentLike,
  CommunityPost, CommunityComment,
} from '../../services/communityApi';
import { parseRitualBody } from './ritualPostBody';

/**
 * CommunityThreadPanel — the discussion experience for ONE community post,
 * rendered in the Today card drawer and the full workspace.
 *
 * Why it exists: a `community:<postId>` item in the Today feed is a POST, not a
 * curriculum card. It has no card_id, so the drawer fell back to using the feed
 * ref as a card id and asked the card-scoped runtime for it — which is how
 * opening a classmate's post produced "Couldn't load this week's ritual". Worse,
 * even a working ritual wall answers the wrong question: the student clicked one
 * person's post and wants THAT conversation, not a grid of everyone's.
 *
 * So this panel opens the thread: the post rendered as the guided answer it is,
 * every reply beneath it, and a composer that is always on screen. Reading and
 * replying are the two things the surface exists for, so neither is behind a
 * click. The week's full ritual wall stays one tap away via "Enter workspace".
 *
 * Self-styled (own <style>, light + dark), matching PeerWinsPanel's tokens so
 * the two drawer panels read as siblings.
 */

interface Props {
  postId: string;
  /** Ritual identity from the feed item, used until the post itself loads. */
  fallbackLabel?: string | null;
  preview?: boolean;   // admin Studio: sample thread, non-interactive
}

const LEVEL_NAMES: Record<number, string> = { 1: 'Apprentice', 2: 'Builder', 3: 'Architect', 4: 'Principal' };

const avColor = (n: string) => {
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 46% 42%)`;
};
const initialsOf = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';
const timeAgo = (iso: string): string => {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!isFinite(d) || d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
};
const IMG_RE = /\.(png|jpe?g|gif|webp|avif)(\?|#|$)/i;

const SAMPLE_POST: CommunityPost = {
  id: 'sample', body: '🧩 Skill Drop · Week 2\n\nMy 3 skills: invoice-parser, tone-checker, standup-writer\n\nThe one that surprised me: tone-checker caught phrasing I would never have noticed on my own.',
  media_urls: [], category: 'General', pinned: false, like_count: 6, comment_count: 2,
  viewer_has_liked: false, mentioned_member_ids: [], min_level: 1, locked: false,
  created_at: new Date(Date.now() - 5 * 3600e3).toISOString(),
  member: { id: 'm1', display_name: 'Hellen Muhonja', avatar_url: null, level: 1 },
  recent_commenters: [],
};
const SAMPLE_COMMENTS: CommunityComment[] = [
  {
    id: 'c1', body: 'The triage one is the skill I keep coming back to. How long did yours take to get right?',
    parent_comment_id: null, like_count: 2, viewer_has_liked: false,
    created_at: new Date(Date.now() - 3 * 3600e3).toISOString(),
    member: { id: 'm2', display_name: 'Marcus Lee', avatar_url: null, level: 2 },
    replies: [{
      id: 'c2', body: 'Three passes. The first version tried to do too much at once.',
      parent_comment_id: 'c1', like_count: 1, viewer_has_liked: true,
      created_at: new Date(Date.now() - 2 * 3600e3).toISOString(),
      member: { id: 'm1', display_name: 'Hellen Muhonja', avatar_url: null, level: 1 },
      replies: [],
    }],
  },
];

const Avatar: React.FC<{ name: string; src: string | null; size: number }> = ({ name, src, size }) => (
  src
    ? <img className="ct-av" style={{ width: size, height: size }} src={src} alt="" />
    : <span className="ct-av" style={{ width: size, height: size, background: avColor(name), fontSize: size * 0.36 }}>{initialsOf(name)}</span>
);

const CommunityThreadPanel: React.FC<Props> = ({ postId, fallbackLabel, preview }) => {
  const [post, setPost] = useState<CommunityPost | null>(preview ? SAMPLE_POST : null);
  const [comments, setComments] = useState<CommunityComment[]>(preview ? SAMPLE_COMMENTS : []);
  const [loading, setLoading] = useState(!preview);
  const [error, setError] = useState('');
  const [threadError, setThreadError] = useState('');

  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    if (preview) return;
    setLoading(true); setError(''); setThreadError('');
    // The post is the page; the thread is an enhancement. Load them together but
    // fail them apart, so a comments outage still shows the post rather than
    // blanking the whole panel (which is the failure this panel replaces).
    const [postRes, commentsRes] = await Promise.allSettled([fetchPost(postId), fetchComments(postId)]);
    if (postRes.status === 'fulfilled') {
      setPost(postRes.value);
    } else {
      const status = (postRes.reason as any)?.response?.status;
      setError(
        status === 404 ? 'This post has been removed.'
          : status === 403 ? 'This post belongs to another cohort.'
            : 'Couldn’t load this post.'
      );
    }
    if (commentsRes.status === 'fulfilled') setComments(commentsRes.value);
    else setThreadError('Couldn’t load the replies.');
    setLoading(false);
  }, [postId, preview]);

  useEffect(() => { load(); }, [load]);

  const total = comments.reduce((n, c) => n + 1 + (c.replies?.length || 0), 0);

  const cheer = async () => {
    if (preview || !post) return;
    const prev = { liked: post.viewer_has_liked, count: post.like_count };
    setPost({ ...post, viewer_has_liked: !prev.liked, like_count: prev.count + (prev.liked ? -1 : 1) });
    try {
      const r = await togglePostLike(post.id);
      setPost((p) => (p ? { ...p, viewer_has_liked: r.liked, like_count: r.like_count } : p));
    } catch {
      setPost((p) => (p ? { ...p, viewer_has_liked: prev.liked, like_count: prev.count } : p));
    }
  };

  const likeComment = async (id: string) => {
    if (preview) return;
    const apply = (list: CommunityComment[], fn: (c: CommunityComment) => CommunityComment): CommunityComment[] =>
      list.map((c) => (c.id === id ? fn(c) : { ...c, replies: apply(c.replies || [], fn) }));
    const find = (list: CommunityComment[]): CommunityComment | null => {
      for (const c of list) {
        if (c.id === id) return c;
        const hit = find(c.replies || []);
        if (hit) return hit;
      }
      return null;
    };
    // Snapshot BEFORE the optimistic write, not inside the updater — a state
    // updater must stay pure, and React may run it more than once.
    const prev = find(comments);
    if (!prev) return;
    setComments((list) => apply(list, (c) => (
      { ...c, viewer_has_liked: !c.viewer_has_liked, like_count: c.like_count + (c.viewer_has_liked ? -1 : 1) }
    )));
    try {
      const r = await toggleCommentLike(id);
      setComments((list) => apply(list, (c) => ({ ...c, viewer_has_liked: r.liked, like_count: r.like_count })));
    } catch {
      setComments((list) => apply(list, (c) => (
        { ...c, viewer_has_liked: prev.viewer_has_liked, like_count: prev.like_count }
      )));
    }
  };

  const startReply = (id: string, name: string) => {
    setReplyTo({ id, name });
    window.setTimeout(() => taRef.current?.focus(), 0);
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || sending || preview || !post) return;
    setSending(true); setSendError('');
    try {
      const created = await createComment(post.id, body, replyTo?.id);
      setComments((list) => (
        replyTo
          ? list.map((c) => (c.id === replyTo.id ? { ...c, replies: [...(c.replies || []), created] } : c))
          : [...list, created]
      ));
      setPost((p) => (p ? { ...p, comment_count: p.comment_count + 1 } : p));
      setDraft(''); setReplyTo(null);
    } catch (e: any) {
      setSendError(e?.response?.data?.error || 'Couldn’t post your reply — try again.');
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const styleBlock = (
    <style>{`
      .ct{--ct-accent:#367895;--ct-gold:#E8920C;--ct-ink:#1A1A1A;--ct-muted:#6B6B6B;--ct-line:#E4E4E3;--ct-panel:#FFFFFF;--ct-sunken:#F6F7F8;font-family:inherit;color:var(--ct-ink);display:flex;flex-direction:column;min-height:100%}
      @media (prefers-color-scheme:dark){.ct{--ct-ink:#FFFFFF;--ct-muted:#B4B4B4;--ct-line:rgba(255,255,255,.14);--ct-panel:#141414;--ct-sunken:#1C1C1C}}
      :root[data-theme="dark"] .ct,.tl-de[data-theme="dark"] .ct{--ct-ink:#FFFFFF;--ct-muted:#B4B4B4;--ct-line:rgba(255,255,255,.14);--ct-panel:#141414;--ct-sunken:#1C1C1C}
      :root[data-theme="light"] .ct,.tl-de[data-theme="light"] .ct{--ct-ink:#1A1A1A;--ct-muted:#6B6B6B;--ct-line:#E4E4E3;--ct-panel:#FFFFFF;--ct-sunken:#F6F7F8}
      .ct-eyebrow{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--ct-accent);display:flex;align-items:center;gap:7px;margin-bottom:12px}
      .ct-av{flex:none;border-radius:50%;color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;object-fit:cover}
      .ct-post{border:1.5px solid var(--ct-line);border-radius:16px;padding:16px;background:var(--ct-panel)}
      .ct-who{display:flex;align-items:center;gap:10px;margin-bottom:12px}
      .ct-name{font-size:14px;font-weight:750;line-height:1.2}
      .ct-sub{font-size:11.5px;color:var(--ct-muted);margin-top:1px}
      .ct-sec{margin-bottom:12px}.ct-sec:last-of-type{margin-bottom:0}
      .ct-seclab{font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--ct-muted);margin-bottom:4px}
      .ct-secval{font-size:14px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}
      .ct-media{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-top:12px}
      .ct-media img,.ct-media video{width:100%;border-radius:10px;border:1px solid var(--ct-line);display:block}
      .ct-link{display:inline-block;margin-top:10px;font-size:13px;font-weight:700;color:var(--ct-accent);word-break:break-all}
      .ct-actions{display:flex;align-items:center;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid var(--ct-line)}
      .ct-act{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--ct-line);border-radius:999px;padding:6px 13px;font-size:12.5px;font-weight:700;color:var(--ct-muted);background:var(--ct-panel);cursor:pointer;font-variant-numeric:tabular-nums}
      .ct-act:hover{border-color:var(--ct-accent);color:var(--ct-accent)}
      .ct-act.on{background:color-mix(in srgb,var(--ct-gold) 13%,transparent);border-color:var(--ct-gold);color:var(--ct-gold)}
      .ct-act .em{font-size:14px;line-height:1}
      .ct-threadlab{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--ct-muted);margin:22px 0 12px}
      .ct-list{display:flex;flex-direction:column;gap:14px}
      .ct-cm{display:flex;gap:10px}
      .ct-cm.reply{margin-left:34px}
      .ct-bubble{background:var(--ct-sunken);border:1px solid var(--ct-line);border-radius:14px;padding:9px 13px}
      .ct-cmname{font-size:12.5px;font-weight:750;margin-bottom:2px}
      .ct-cmtext{font-size:13.5px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
      .ct-cmmeta{display:flex;align-items:center;gap:12px;margin:5px 0 0 4px;font-size:11.5px;color:var(--ct-muted)}
      .ct-cmmeta button{background:none;border:none;padding:0;font-size:11.5px;font-weight:700;color:var(--ct-muted);cursor:pointer}
      .ct-cmmeta button:hover{color:var(--ct-accent)}
      .ct-cmmeta button.liked{color:var(--ct-gold)}
      .ct-replies{display:flex;flex-direction:column;gap:12px;margin-top:12px}
      .ct-empty{text-align:center;padding:22px 14px;border:1.5px dashed var(--ct-line);border-radius:14px;color:var(--ct-muted)}
      .ct-empty .big{font-size:26px;margin-bottom:6px}
      .ct-empty h4{font-size:14.5px;font-weight:750;color:var(--ct-ink);margin:0 0 3px}
      .ct-empty p{font-size:13px;margin:0;line-height:1.5}
      .ct-composer{position:sticky;bottom:0;margin-top:20px;padding-top:12px;background:linear-gradient(180deg,transparent,var(--ct-panel) 26%);}
      .ct-replyto{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;color:var(--ct-accent);background:color-mix(in srgb,var(--ct-accent) 10%,transparent);border-radius:9px 9px 0 0;padding:7px 12px}
      .ct-replyto button{margin-left:auto;background:none;border:none;color:inherit;font-size:15px;line-height:1;cursor:pointer;padding:0 2px}
      .ct-crow{display:flex;gap:9px;align-items:flex-end;border:1.5px solid var(--ct-line);border-radius:14px;padding:9px;background:var(--ct-panel)}
      .ct-crow:focus-within{border-color:var(--ct-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--ct-accent) 18%,transparent)}
      .ct-replyto + .ct-crow{border-top-left-radius:0;border-top-right-radius:0}
      .ct-ta{flex:1;border:none;outline:none;resize:none;background:transparent;color:var(--ct-ink);font-family:inherit;font-size:14px;line-height:1.5;min-height:38px;max-height:150px;padding:5px 4px}
      .ct-send{flex:none;border:none;border-radius:10px;background:var(--ct-accent);color:#fff;font-size:13.5px;font-weight:750;padding:9px 17px;cursor:pointer}
      .ct-send:disabled{opacity:.4;cursor:not-allowed}
      .ct-hint{font-size:11px;color:var(--ct-muted);margin:6px 4px 0}
      .ct-err{color:#C20E1E;font-size:12.5px;margin-top:8px}
      .ct-state{padding:30px 14px;text-align:center;color:var(--ct-muted);font-size:13.5px}
      .ct-retry{margin-top:12px;border:1px solid var(--ct-line);background:var(--ct-panel);color:var(--ct-ink);border-radius:10px;padding:8px 18px;font-size:13px;font-weight:700;cursor:pointer}
      .ct-retry:hover{border-color:var(--ct-accent);color:var(--ct-accent)}
      @media (prefers-reduced-motion:reduce){*{transition:none!important}}
    `}</style>
  );

  if (loading) return <div className="ct">{styleBlock}<div className="ct-state">Loading the discussion…</div></div>;

  // A dead end is what this panel exists to remove: every failure offers the way out.
  if (!post) {
    return (
      <div className="ct">{styleBlock}
        <div className="ct-state">
          <p style={{ margin: 0 }}>{error || 'This post isn’t available.'}</p>
          <button type="button" className="ct-retry" onClick={load}>Try again</button>
        </div>
      </div>
    );
  }

  const parsed = parseRitualBody(post.body);
  const label = parsed.ritualName
    ? `${parsed.icon ? `${parsed.icon} ` : ''}${parsed.ritualName}${parsed.week != null ? ` · Week ${parsed.week}` : ''}`
    : (fallbackLabel || 'Community post');
  const media = Array.isArray(post.media_urls) ? post.media_urls.filter((u) => typeof u === 'string' && u.trim()) : [];
  const images = media.filter((u) => IMG_RE.test(u));
  const links = media.filter((u) => !IMG_RE.test(u));

  const commentRow = (c: CommunityComment, isReply: boolean) => (
    <div key={c.id} className={`ct-cm${isReply ? ' reply' : ''}`}>
      <Avatar name={c.member.display_name} src={c.member.avatar_url} size={isReply ? 26 : 32} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="ct-bubble">
          <div className="ct-cmname">{c.member.display_name}</div>
          <div className="ct-cmtext">{c.body}</div>
        </div>
        <div className="ct-cmmeta">
          <span>{timeAgo(c.created_at)}</span>
          <button
            type="button" className={c.viewer_has_liked ? 'liked' : ''} aria-pressed={c.viewer_has_liked}
            onClick={() => likeComment(c.id)}
          >
            {c.viewer_has_liked ? 'Liked' : 'Like'}{c.like_count > 0 ? ` · ${c.like_count}` : ''}
          </button>
          {!isReply && (
            <button type="button" onClick={() => startReply(c.id, c.member.display_name)}>Reply</button>
          )}
        </div>
        {!isReply && !!c.replies?.length && (
          <div className="ct-replies">{c.replies.map((r) => commentRow(r, true))}</div>
        )}
      </div>
    </div>
  );

  return (
    <div className="ct">
      {styleBlock}
      <div className="ct-eyebrow">{label}</div>

      <article className="ct-post">
        <header className="ct-who">
          <Avatar name={post.member.display_name} src={post.member.avatar_url} size={40} />
          <div>
            <div className="ct-name">{post.member.display_name}</div>
            <div className="ct-sub">
              Level {post.member.level} · {LEVEL_NAMES[post.member.level] || 'Builder'} · {timeAgo(post.created_at)}
            </div>
          </div>
        </header>

        {post.locked ? (
          <div className="ct-secval" style={{ color: 'var(--ct-muted)' }}>
            This post stays hidden until you reach level {post.min_level}.
          </div>
        ) : (
          <>
            {parsed.sections.map((s, i) => (
              <div className="ct-sec" key={i}>
                {s.label && <div className="ct-seclab">{s.label}</div>}
                <div className="ct-secval">{s.value}</div>
              </div>
            ))}
            {!!images.length && (
              <div className="ct-media">
                {images.map((u) => <img key={u} src={u} alt="" loading="lazy" />)}
              </div>
            )}
            {links.map((u) => (
              <a className="ct-link" key={u} href={u} target="_blank" rel="noopener noreferrer">{u}</a>
            ))}
          </>
        )}

        <div className="ct-actions">
          <button
            type="button" className={`ct-act${post.viewer_has_liked ? ' on' : ''}`} aria-pressed={post.viewer_has_liked}
            onClick={cheer} disabled={preview}
          >
            <span className="em">👏</span>{post.like_count > 0 ? post.like_count : 'Cheer'}
          </button>
          <button type="button" className="ct-act" onClick={() => taRef.current?.focus()}>
            <span className="em">💬</span>{total > 0 ? `${total} ${total === 1 ? 'reply' : 'replies'}` : 'Reply'}
          </button>
        </div>
      </article>

      <div className="ct-threadlab">Discussion{total > 0 ? ` · ${total}` : ''}</div>

      {threadError ? (
        <div className="ct-state">
          <p style={{ margin: 0 }}>{threadError}</p>
          <button type="button" className="ct-retry" onClick={load}>Try again</button>
        </div>
      ) : comments.length === 0 ? (
        <div className="ct-empty">
          <div className="big">💬</div>
          <h4>No replies yet</h4>
          <p>Be the first to respond — a question or a “this helped” both count.</p>
        </div>
      ) : (
        <div className="ct-list">{comments.map((c) => commentRow(c, false))}</div>
      )}

      <div className="ct-composer">
        {replyTo && (
          <div className="ct-replyto">
            Replying to {replyTo.name}
            <button type="button" aria-label="Cancel reply" onClick={() => setReplyTo(null)}>×</button>
          </div>
        )}
        <div className="ct-crow">
          <textarea
            ref={taRef} className="ct-ta" value={draft} rows={1}
            aria-label={replyTo ? `Reply to ${replyTo.name}` : 'Write a reply'}
            placeholder={replyTo ? `Reply to ${replyTo.name}…` : 'Write a reply…'}
            onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} disabled={preview}
          />
          <button type="button" className="ct-send" disabled={!draft.trim() || sending || preview} onClick={send}>
            {sending ? 'Posting…' : 'Send'}
          </button>
        </div>
        {sendError && <div className="ct-err">{sendError}</div>}
        <div className="ct-hint">Enter to send · Shift + Enter for a new line</div>
      </div>
    </div>
  );
};

export default CommunityThreadPanel;
