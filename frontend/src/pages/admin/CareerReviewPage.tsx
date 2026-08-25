import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchReviewQueue, submitReviewDecision,
  ReviewQueueItem, ReviewDecision,
} from '../../services/careerApi';
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

  const load = useCallback(() => {
    setErr(null);
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

      {items !== null && items.length === 0 && !err && (
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
              {it.slug && (
                <a className="cr-btn ghost" href={`/p/${it.slug}`} target="_blank" rel="noopener noreferrer">
                  Open record
                </a>
              )}
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
