import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchReviewQueue, submitReviewDecision, fetchRecordForReview,
  fetchPortfolioReviewQueue, submitPortfolioDecision, type PortfolioQueueItem,
  ReviewQueueItem, ReviewDecision, RecordForReview,
} from '../../services/careerApi';
import ReviewRecordPreview from './ReviewRecordPreview';
import './CareerReviewPage.css';

/**
 * CareerReviewPage — the reviewer's surface for Capstone Record publication.
 *
 * Reached by admins and by mentors. What differs is not this page but what the API
 * returns: a mentor's queue contains only the learners they are over, enforced server
 * side in careerMentorScopeService. This component never filters — if it did, the
 * filtering would be decoration over an API that had already handed out too much.
 *
 * `reviewer_kind` comes back from the queue so the page can say plainly whether it is
 * showing everyone or only this mentor's learners. A scoped surface that looks identical
 * to an unscoped one invites someone to assume they have seen everything.
 */

const DECISIONS: Array<{ key: ReviewDecision; label: string; cls: string; needsNotes: boolean }> = [
  { key: 'approved', label: 'Approve and publish', cls: 'ok', needsNotes: false },
  { key: 'changes_requested', label: 'Request changes', cls: 'warn', needsNotes: true },
  { key: 'rejected', label: 'Reject', cls: 'no', needsNotes: false },
];

const CareerReviewPage: React.FC = () => {
  const [items, setItems] = useState<ReviewQueueItem[] | null>(null);
  const [kind, setKind] = useState<'admin' | 'mentor' | 'none'>('none');
  const [openId, setOpenId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Portfolio pages are a SECOND queue over a different thing. Shipping the request and
  // decide endpoints without this list left a learner waiting on a review no reviewer
  // could see -- Ali hit exactly that within minutes of the deploy.
  const [pages, setPages] = useState<PortfolioQueueItem[] | null>(null);
  const [pagesError, setPagesError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RecordForReview | null>(null);
  const [previewFor, setPreviewFor] = useState<string | null>(null);

  const load = useCallback(() => {
    setErr(null);
    // A failure here must be VISIBLE. `.catch(() => setPages([]))` turned a 401 into a
    // clean "Nothing to review", which is how a wrong-token bug survived a deploy and a
    // round of live verification: the screen looked correct and was lying.
    fetchPortfolioReviewQueue()
      .then((rows) => { setPages(rows); setPagesError(null); })
      .catch((e: any) => {
        setPages([]);
        setPagesError(
          e?.response?.status === 401 || e?.response?.status === 403
            ? 'Could not load portfolio pages: not authorised. Try signing in again.'
            : 'Could not load portfolio pages. They may be waiting but hidden.',
        );
      });
    fetchReviewQueue()
      .then((r) => { setItems(r.items); setKind(r.reviewer_kind); })
      .catch((e: any) => {
        setItems([]);
        setErr(e?.response?.status === 403
          ? 'You do not have portfolio review access.'
          : 'Could not load the review queue.');
      });
  }, []);
  useEffect(load, [load]);

  const decide = async (recordId: string, decision: ReviewDecision) => {
    const needsNotes = DECISIONS.find((d) => d.key === decision)?.needsNotes;
    if (needsNotes && !notes.trim()) {
      setErr('Requesting changes needs a note explaining what to change.');
      return;
    }
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await submitReviewDecision(recordId, decision, notes.trim() || undefined);
      setMsg(r.published ? 'Approved. The record is now published.' : `Recorded: ${r.decision.replace('_', ' ')}.`);
      setOpenId(null); setNotes('');
      load();
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Could not record that decision.');
    } finally { setBusy(false); }
  };

  return (
    <div className="cr-wrap">
      <div className="cr-head">
        <div>
          <div className="cr-crumb">Admin</div>
          <h1 className="cr-h1">Portfolio review queue</h1>
          <p className="cr-sub">
            {items === null ? 'Loading…'
              : items.length === 0 ? 'Nothing awaiting a decision.'
              : `${items.length} record${items.length === 1 ? '' : 's'} awaiting a decision, oldest first.`}
            {kind === 'mentor' && <> Showing only the learners you mentor.</>}
            {kind === 'admin' && items !== null && items.length > 0 && <> Showing all learners.</>}
          </p>
        </div>
        <button type="button" className="cr-btn ghost" onClick={load} disabled={busy}>Refresh</button>
      </div>

      {msg && <div className="cr-banner ok" role="status">{msg}</div>}
      {err && <div className="cr-banner err" role="alert">{err}</div>}

      {pagesError && <div className="cr-banner err" role="alert">{pagesError}</div>}

      {/* Portfolio pages: the person-level page at /portfolio/:slug. */}
      {pages !== null && pages.length > 0 && (
        <section className="cr-group">
          <h2 className="cr-h2">
            Portfolio pages ({pages.length})
          </h2>
          {pages.map((p) => (
            <article className="cr-card" key={p.enrollment_id}>
              <div className="cr-card-head">
                <div>
                  <div className="cr-name">{p.full_name || 'Unnamed learner'}</div>
                  <div className="cr-muted cr-mono">{p.public_path}</div>
                </div>
                <div className="cr-muted">
                  asked {new Date(p.requested_at).toLocaleDateString()}
                </div>
              </div>
              <div className="cr-actions">
                <button
                  type="button" className="cr-btn" disabled={busy}
                  onClick={async () => {
                    setBusy(true); setErr(null);
                    try {
                      await submitPortfolioDecision(p.enrollment_id, 'approved');
                      setMsg(`Approved. ${p.public_path} is now live.`);
                      load();
                    } catch (e: any) {
                      setErr(e?.response?.data?.error || 'Could not record that decision.');
                    } finally { setBusy(false); }
                  }}
                >Approve and publish</button>
                <button
                  type="button" className="cr-btn ghost" disabled={busy}
                  onClick={async () => {
                    setBusy(true); setErr(null);
                    try {
                      await submitPortfolioDecision(p.enrollment_id, 'changes_requested');
                      setMsg('Sent back for changes.');
                      load();
                    } catch (e: any) {
                      setErr(e?.response?.data?.error || 'Could not record that decision.');
                    } finally { setBusy(false); }
                  }}
                >Ask for changes</button>
              </div>
            </article>
          ))}
        </section>
      )}

      {items !== null && items.length === 0 && (pages === null || pages.length === 0) && !err && !pagesError && (
        <div className="cr-empty">
          <p>Nothing to review.</p>
          <p className="cr-muted">
            {kind === 'mentor'
              ? 'When a learner you mentor sends their record for review, it appears here.'
              : 'When a learner sends their record for review, it appears here.'}
          </p>
        </div>
      )}

      {items?.map((it) => (
        <div className="cr-card" key={it.review_id}>
          <div className="cr-row">
            <div>
              <div className="cr-name">{it.full_name || 'Unnamed learner'}</div>
              <div className="cr-meta">
                version {it.version}
                {it.slug && <> · <span className="cr-mono">/p/{it.slug}</span></>}
                {it.visibility && <> · {it.visibility}</>}
                {' · '}requested {new Date(it.requested_at).toLocaleDateString()}
              </div>
            </div>
            <div className="cr-actions">
              {/* NOT a link to /p/:slug. Everything awaiting review is unpublished, so the
                  public page 404s on all of it — and it would throw a reviewer out of admin
                  into the public marketing shell. The record renders here instead. */}
              <button
                type="button"
                className="cr-btn ghost"
                aria-expanded={previewFor === it.record_id}
                onClick={async () => {
                  if (previewFor === it.record_id) { setPreviewFor(null); setPreview(null); return; }
                  setPreviewFor(it.record_id); setPreview(null); setErr(null);
                  try { setPreview(await fetchRecordForReview(it.record_id)); }
                  catch { setErr('Could not load that record.'); setPreviewFor(null); }
                }}
              >
                {previewFor === it.record_id ? 'Hide record' : 'View record'}
              </button>
              <button
                type="button"
                className="cr-btn"
                aria-expanded={openId === it.record_id}
                onClick={() => { setOpenId(openId === it.record_id ? null : it.record_id); setNotes(''); setErr(null); }}
              >
                {openId === it.record_id ? 'Cancel' : 'Decide'}
              </button>
            </div>
          </div>

          {previewFor === it.record_id && (
            <div className="cr-preview">
              {!preview ? <p className="cr-muted">Loading the record…</p> : (
                <>
                  <div className="cr-preview-head">
                    <span className="cr-mono">/p/{preview.slug}</span>
                    <span className="cr-muted">version {preview.version} · {preview.status} · {preview.visibility}</span>
                  </div>
                  <ReviewRecordPreview record={preview} />
                  <p className="cr-note">
                    This is the stored snapshot, exactly as it would publish. Approving publishes
                    <strong> this</strong>, not a fresh render.
                  </p>
                </>
              )}
            </div>
          )}

          {openId === it.record_id && (
            <div className="cr-decide">
              <label className="cr-label" htmlFor={`n-${it.record_id}`}>
                Notes to the learner
                <span className="cr-muted"> — required when requesting changes</span>
              </label>
              <textarea
                id={`n-${it.record_id}`}
                className="cr-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What should they change, and why?"
              />
              <div className="cr-actions">
                {DECISIONS.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    className={`cr-btn ${d.cls}`}
                    disabled={busy}
                    onClick={() => decide(it.record_id, d.key)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <p className="cr-note">
                Approving publishes the record. It does <strong>not</strong> change who can see it —
                the learner chooses that.
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default CareerReviewPage;
