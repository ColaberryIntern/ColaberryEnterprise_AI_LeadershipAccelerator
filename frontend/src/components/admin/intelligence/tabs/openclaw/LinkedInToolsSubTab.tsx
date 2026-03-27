import { useState, useEffect, useCallback } from 'react';
import { useOpenclawContext } from './OpenclawContext';
import { PLATFORM_COLORS, STATUS_BADGES, timeAgo } from './openclawUtils';
import {
  generateLinkedInPost,
  generateLinkedInCommentReplies,
  submitOpenclawSignal,
  trackLinkedInPost,
  getTrackedLinkedInPosts,
  removeTrackedLinkedInPost,
  type TrackedLinkedInPost,
} from '../../../../../services/openclawApi';
import {
  getAuthorityContent,
  generateAuthorityContent,
  approveAuthorityContent,
  markAuthorityContentPosted,
  type AuthorityContentItem,
} from '../../../../../services/openclawReputationApi';

// ═══════════════════════════════════════════════════════════════════════════════
// LinkedIn Tools Sub-Tab
// ═══════════════════════════════════════════════════════════════════════════════

export default function LinkedInToolsSubTab() {
  const { linkedinSessionOk, trackedPosts: ctxTrackedPosts, fetchData } = useOpenclawContext();

  // ── Generate LinkedIn Post state ────────────────────────────────────────────
  const [linkedinTopic, setLinkedinTopic] = useState('');
  const [generatingLinkedin, setGeneratingLinkedin] = useState(false);
  const [linkedinResult, setLinkedinResult] = useState<{ success: boolean; message: string } | null>(null);

  // ── Submit Signal URL state ─────────────────────────────────────────────────
  const [submitUrl, setSubmitUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string } | null>(null);

  // ── My LinkedIn Posts state ─────────────────────────────────────────────────
  const [trackedPosts, setTrackedPosts] = useState<TrackedLinkedInPost[]>(ctxTrackedPosts);
  const [trackUrl, setTrackUrl] = useState('');
  const [trackingPost, setTrackingPost] = useState(false);

  // ── Reply to LinkedIn Comments state ────────────────────────────────────────
  const [commentReplyUrl, setCommentReplyUrl] = useState('');
  const [commentsPastedText, setCommentsPastedText] = useState('');
  const [generatingReply, setGeneratingReply] = useState(false);
  const [replyResult, setReplyResult] = useState<{ success: boolean; message: string } | null>(null);

  // Keep local tracked posts in sync with context
  useEffect(() => {
    setTrackedPosts(ctxTrackedPosts);
  }, [ctxTrackedPosts]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleGenerateLinkedIn = async () => {
    if (!linkedinTopic.trim() || generatingLinkedin) return;
    setGeneratingLinkedin(true);
    setLinkedinResult(null);
    try {
      const res = await generateLinkedInPost(linkedinTopic.trim());
      setLinkedinResult({
        success: true,
        message: `LinkedIn post generated (${res.data.short_id}). Find it in the Manual Queue tab — copy the content and post it on LinkedIn.`,
      });
      setLinkedinTopic('');
      setTimeout(fetchData, 2000);
    } catch (err: any) {
      setLinkedinResult({
        success: false,
        message: err?.response?.data?.error || 'Failed to generate post',
      });
    }
    setGeneratingLinkedin(false);
  };

  const handleSubmitUrl = async () => {
    if (!submitUrl.trim() || submitting) return;
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const res = await submitOpenclawSignal(submitUrl.trim());
      setSubmitResult({
        success: true,
        message: `Signal created for "${res.data.signal.title?.slice(0, 60) || 'URL'}". Response will appear in the queue shortly.`,
      });
      setSubmitUrl('');
      setTimeout(fetchData, 3000);
    } catch (err: any) {
      setSubmitResult({
        success: false,
        message: err?.response?.data?.error || 'Failed to submit URL',
      });
    }
    setSubmitting(false);
  };

  const handleTrackPost = async () => {
    if (!trackUrl.trim()) return;
    setTrackingPost(true);
    try {
      const res = await trackLinkedInPost(trackUrl.trim());
      if (res.data.success) {
        setTrackUrl('');
        const trackedRes = await getTrackedLinkedInPosts();
        setTrackedPosts(trackedRes.data.tracked_posts || []);
      }
    } catch {
      /* ignore */
    }
    setTrackingPost(false);
  };

  const handleRemoveTrackedPost = async (id: string) => {
    try {
      await removeTrackedLinkedInPost(id);
      setTrackedPosts(prev => prev.filter(p => p.id !== id));
    } catch {
      /* ignore */
    }
  };

  const handleGenerateCommentReplies = async () => {
    if (!commentReplyUrl.trim() || !commentsPastedText.trim() || generatingReply) return;
    setGeneratingReply(true);
    setReplyResult(null);
    try {
      const payload: { post_url: string; comments_text?: string } = {
        post_url: commentReplyUrl.trim(),
      };
      if (commentsPastedText.trim().length > 10) {
        payload.comments_text = commentsPastedText.trim();
      }
      const res = await generateLinkedInCommentReplies(payload);
      const data = res.data;
      if (data.replies_generated === 0) {
        setReplyResult({
          success: true,
          message: data.message || 'No comments found. Try pasting the comments text.',
        });
      } else {
        const names = data.replies.map((r: any) => r.commenter_name).join(', ');
        setReplyResult({
          success: true,
          message: `Generated ${data.replies_generated} replies for ${names}. Check Manual Action tab to copy & post.`,
        });
        setCommentReplyUrl('');
        setCommentsPastedText('');
      }
      setTimeout(fetchData, 2000);
    } catch (err: any) {
      setReplyResult({
        success: false,
        message: err?.response?.data?.error || 'Failed to generate replies',
      });
    }
    setGeneratingReply(false);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* LinkedIn Session Status Indicator */}
      <div className="d-flex align-items-center mb-3">
        <span className="fw-semibold small me-2">LinkedIn Session</span>
        {linkedinSessionOk === null ? (
          <span className="badge bg-secondary" style={{ fontSize: '0.6rem' }}>Checking...</span>
        ) : linkedinSessionOk ? (
          <span className="badge bg-success" style={{ fontSize: '0.6rem' }}>Connected</span>
        ) : (
          <span className="badge bg-danger" style={{ fontSize: '0.6rem' }}>Not Connected</span>
        )}
      </div>

      {/* ── Generate LinkedIn Post ─────────────────────────────────────────── */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold small">
          Generate LinkedIn Post
          <span
            className="badge ms-2"
            style={{ fontSize: '0.55rem', verticalAlign: 'middle', backgroundColor: PLATFORM_COLORS.linkedin, color: '#fff' }}
          >
            LinkedIn
          </span>
        </div>
        <div className="card-body py-3 px-3">
          <div className="text-muted mb-2" style={{ fontSize: '0.68rem' }}>
            Enter a topic or trend. AI generates a practitioner-voice LinkedIn post with a tracked link to your strategy call booking page.
          </div>
          <div className="d-flex gap-2">
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="e.g., Why most AI pilots fail at the enterprise level"
              value={linkedinTopic}
              onChange={e => setLinkedinTopic(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && linkedinTopic.trim() && !generatingLinkedin && handleGenerateLinkedIn()}
            />
            <button
              className="btn btn-sm btn-primary text-nowrap"
              onClick={handleGenerateLinkedIn}
              disabled={!linkedinTopic.trim() || generatingLinkedin}
            >
              {generatingLinkedin ? 'Generating...' : 'Generate'}
            </button>
          </div>
          {linkedinResult && (
            <div className={`alert alert-${linkedinResult.success ? 'success' : 'danger'} mt-2 py-1 px-2 small mb-0`}>
              {linkedinResult.message}
            </div>
          )}
        </div>
      </div>

      {/* ── Submit Signal URL ──────────────────────────────────────────────── */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold small">
          Submit Question URL
          <span className="badge bg-secondary ms-2" style={{ fontSize: '0.55rem', verticalAlign: 'middle' }}>Any Platform</span>
        </div>
        <div className="card-body py-3 px-3">
          <div className="text-muted mb-2" style={{ fontSize: '0.68rem' }}>
            Paste a question URL from any platform. The system will extract the content and generate a response for your review.
          </div>
          <div className="d-flex gap-2">
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="https://www.quora.com/What-is-..."
              value={submitUrl}
              onChange={e => setSubmitUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitUrl.trim() && !submitting && handleSubmitUrl()}
            />
            <button
              className="btn btn-sm btn-primary text-nowrap"
              onClick={handleSubmitUrl}
              disabled={!submitUrl.trim() || submitting}
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
          {submitResult && (
            <div className={`alert alert-${submitResult.success ? 'success' : 'danger'} mt-2 py-1 px-2 small mb-0`}>
              {submitResult.message}
            </div>
          )}
        </div>
      </div>

      {/* ── My LinkedIn Posts ──────────────────────────────────────────────── */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold small">
          My LinkedIn Posts
          <span
            className="badge ms-2"
            style={{ fontSize: '0.55rem', verticalAlign: 'middle', backgroundColor: PLATFORM_COLORS.linkedin, color: '#fff' }}
          >
            LinkedIn
          </span>
        </div>
        <div className="card-body py-3 px-3">
          <div className="text-muted mb-3" style={{ fontSize: '0.68rem' }}>
            Save your LinkedIn posts here for quick access. To reply to comments, click "Reply" to pre-fill the form below, then paste the comments from your browser.
          </div>

          <div className="d-flex gap-2 align-items-end mb-3">
            <div className="flex-grow-1">
              <label className="form-label small fw-medium mb-1">Add LinkedIn Post URL</label>
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="https://linkedin.com/posts/... or https://linkedin.com/feed/update/urn:li:activity:..."
                value={trackUrl}
                onChange={e => setTrackUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && trackUrl.trim() && !trackingPost && handleTrackPost()}
              />
            </div>
            <button
              className="btn btn-sm btn-primary text-nowrap"
              onClick={handleTrackPost}
              disabled={!trackUrl.trim() || trackingPost}
            >
              {trackingPost ? (
                <>
                  <span className="spinner-border spinner-border-sm me-1" />
                  Adding...
                </>
              ) : (
                '+ Add Post'
              )}
            </button>
          </div>

          {/* Posts List */}
          <div className="border-top pt-3">
            <div className="fw-semibold small mb-2 d-flex align-items-center">
              Saved Posts
              {trackedPosts.length > 0 && (
                <span className="badge bg-primary ms-2" style={{ fontSize: '0.6rem' }}>
                  {trackedPosts.length}
                </span>
              )}
            </div>
            {trackedPosts.length === 0 ? (
              <div className="text-muted text-center py-3" style={{ fontSize: '0.72rem' }}>
                No posts saved yet. Paste a LinkedIn post URL above to add one.
              </div>
            ) : (
              trackedPosts.map(tp => (
                <div
                  key={tp.id}
                  className="d-flex align-items-start justify-content-between py-2 border-bottom"
                  style={{ fontSize: '0.72rem' }}
                >
                  <div className="me-2" style={{ minWidth: 0 }}>
                    <div className="text-truncate">
                      <a
                        href={tp.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-decoration-none fw-medium"
                      >
                        {tp.title && tp.title !== 'Tracking: LinkedIn Post' ? tp.title : tp.source_url}
                      </a>
                    </div>
                    <div className="text-muted mt-1" style={{ fontSize: '0.65rem' }}>
                      {tp.details?.known_commenters?.length > 0 ? (
                        <span>{tp.details.known_commenters.length} replies generated</span>
                      ) : (
                        <span>No replies yet</span>
                      )}
                    </div>
                  </div>
                  <div className="d-flex gap-1 flex-shrink-0">
                    <a
                      href={tp.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-sm btn-outline-secondary py-0 px-1"
                      style={{ fontSize: '0.6rem' }}
                      title="Open on LinkedIn"
                    >
                      Open
                    </a>
                    <button
                      className="btn btn-sm btn-outline-primary py-0 px-1"
                      style={{ fontSize: '0.6rem' }}
                      title="Pre-fill reply form below"
                      onClick={() => {
                        setCommentReplyUrl(tp.source_url);
                        document.getElementById('linkedin-reply-card')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                    >
                      Reply
                    </button>
                    <button
                      className="btn btn-sm btn-outline-danger py-0 px-1"
                      style={{ fontSize: '0.6rem' }}
                      onClick={() => handleRemoveTrackedPost(tp.id)}
                      title="Remove"
                    >
                      <i className="bi bi-x" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Reply to LinkedIn Comments ─────────────────────────────────────── */}
      <div id="linkedin-reply-card" className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold small">
          Reply to LinkedIn Comments
          <span
            className="badge ms-2"
            style={{ fontSize: '0.55rem', verticalAlign: 'middle', backgroundColor: PLATFORM_COLORS.linkedin, color: '#fff' }}
          >
            LinkedIn
          </span>
        </div>
        <div className="card-body py-3 px-3">
          <div className="text-muted mb-3" style={{ fontSize: '0.68rem' }}>
            Open your LinkedIn post, select and copy the comments section, then paste below. The system will parse commenters and generate personalized replies.
          </div>
          <div className="mb-2">
            <label className="form-label small fw-medium mb-1">LinkedIn Post URL</label>
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="https://linkedin.com/posts/... or https://linkedin.com/feed/update/urn:li:activity:..."
              value={commentReplyUrl}
              onChange={e => setCommentReplyUrl(e.target.value)}
            />
          </div>
          <div className="mb-2">
            <label className="form-label small fw-medium mb-1">Paste Comments</label>
            <textarea
              className="form-control form-control-sm"
              rows={4}
              placeholder={'Copy the comments section from your LinkedIn post and paste here.\nExample:\n\nBrad Wolfe\nCFO/COO & CFO.ai\nGreat point about system thinking...'}
              value={commentsPastedText}
              onChange={e => setCommentsPastedText(e.target.value)}
              style={{ fontSize: '0.75rem' }}
            />
            <div className="text-muted mt-1" style={{ fontSize: '0.6rem' }}>
              Tip: On the LinkedIn post page, select from the first commenter name down to the last comment text, then Ctrl+C.
            </div>
          </div>
          <button
            className="btn btn-sm btn-primary"
            onClick={handleGenerateCommentReplies}
            disabled={!commentReplyUrl.trim() || !commentsPastedText.trim() || generatingReply}
          >
            {generatingReply ? (
              <>
                <span className="spinner-border spinner-border-sm me-1" />
                Parsing comments &amp; generating replies...
              </>
            ) : (
              'Generate Replies'
            )}
          </button>
          {replyResult && (
            <div className={`alert alert-${replyResult.success ? 'success' : 'danger'} mt-2 py-1 px-2 small mb-0`}>
              {replyResult.message}
            </div>
          )}
        </div>
      </div>

      {/* ── Authority Content Engine ───────────────────────────────────────── */}
      <AuthorityContentSection />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Authority Content Engine (collapsible section)
// ═══════════════════════════════════════════════════════════════════════════════

function AuthorityContentSection() {
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<AuthorityContentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [topic, setTopic] = useState('');
  const [generating, setGenerating] = useState(false);
  const [postUrlInputs, setPostUrlInputs] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAuthorityContent();
      setItems(res.data.authority_content || []);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (expanded) load();
  }, [expanded, load]);

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setGenerating(true);
    try {
      await generateAuthorityContent(topic);
      setTopic('');
      load();
    } catch {
      /* ignore */
    }
    setGenerating(false);
  };

  const handleApprove = async (id: string) => {
    await approveAuthorityContent(id);
    load();
  };

  const handleMarkPosted = async (id: string) => {
    const url = postUrlInputs[id];
    if (!url) return;
    await markAuthorityContentPosted(id, url);
    setPostUrlInputs(p => ({ ...p, [id]: '' }));
    load();
  };

  const copyContent = (item: AuthorityContentItem) => {
    navigator.clipboard.writeText(item.content);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="card border-0 shadow-sm mb-3">
      <div
        className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center"
        style={{ cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
      >
        <span>
          <i className="bi bi-megaphone me-2" />
          Authority Content Engine
        </span>
        <i className={`bi bi-chevron-${expanded ? 'up' : 'down'}`} />
      </div>
      {expanded && (
        <div className="card-body p-3">
          {/* Generate bar */}
          <div className="d-flex gap-2 mb-3">
            <input
              className="form-control form-control-sm"
              placeholder="Enter topic for authority post..."
              value={topic}
              onChange={e => setTopic(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleGenerate()}
            />
            <button
              className="btn btn-sm btn-primary text-nowrap"
              onClick={handleGenerate}
              disabled={generating || !topic.trim()}
            >
              {generating ? (
                <span className="spinner-border spinner-border-sm me-1" />
              ) : (
                <i className="bi bi-magic me-1" />
              )}
              Generate
            </button>
          </div>

          {loading ? (
            <div className="text-center py-3">
              <span className="spinner-border spinner-border-sm text-primary" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-muted small mb-0">No authority content yet — generate your first post above</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ fontSize: '0.8rem' }}>
                <thead className="table-light">
                  <tr>
                    <th>Title</th>
                    <th>Platform</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th style={{ width: '220px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id}>
                      <td>
                        <div className="fw-medium">{item.title || 'Untitled'}</div>
                        <div
                          className="text-muted"
                          style={{
                            fontSize: '0.7rem',
                            maxWidth: '300px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.content.slice(0, 100)}...
                        </div>
                      </td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            backgroundColor: PLATFORM_COLORS[item.platform] || '#6c757d',
                            fontSize: '0.65rem',
                          }}
                        >
                          {item.platform}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge bg-${STATUS_BADGES[item.status] || 'secondary'}`}
                          style={{ fontSize: '0.65rem' }}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="text-nowrap text-muted">{timeAgo(item.created_at)}</td>
                      <td>
                        <div className="d-flex gap-1 flex-wrap">
                          <button
                            className="btn btn-outline-secondary btn-sm py-0 px-1"
                            style={{ fontSize: '0.65rem' }}
                            onClick={() => copyContent(item)}
                          >
                            <i className={`bi ${copiedId === item.id ? 'bi-check' : 'bi-clipboard'} me-1`} />
                            {copiedId === item.id ? 'Copied' : 'Copy'}
                          </button>
                          {item.status === 'draft' && (
                            <button
                              className="btn btn-outline-success btn-sm py-0 px-1"
                              style={{ fontSize: '0.65rem' }}
                              onClick={() => handleApprove(item.id)}
                            >
                              <i className="bi bi-check-circle me-1" />
                              Approve
                            </button>
                          )}
                          {item.status === 'approved' && (
                            <div className="d-flex gap-1">
                              <input
                                className="form-control form-control-sm py-0"
                                style={{ fontSize: '0.65rem', width: '120px' }}
                                placeholder="Post URL..."
                                value={postUrlInputs[item.id] || ''}
                                onChange={e =>
                                  setPostUrlInputs(p => ({ ...p, [item.id]: e.target.value }))
                                }
                              />
                              <button
                                className="btn btn-outline-primary btn-sm py-0 px-1"
                                style={{ fontSize: '0.65rem' }}
                                onClick={() => handleMarkPosted(item.id)}
                                disabled={!postUrlInputs[item.id]}
                              >
                                Posted
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
