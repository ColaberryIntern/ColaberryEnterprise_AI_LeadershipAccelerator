import React, { useCallback, useEffect, useState } from 'react';
import { decideHeadline, fetchHeadlineDrafts, type HeadlineDecision, type HeadlineDraft } from '../../services/hireHeadlineAdminApi';

/**
 * "Hire headline changes" on the career review page: the headline a candidate proposed in
 * their Hire studio, beside the one Hire shows today. Approve makes it live; Decline clears it.
 *
 * The endpoints are admin-only. A mentor also reaches this page, gets a 403 here, and sees
 * nothing at all from this section rather than an error about something they cannot act on.
 * Renders nothing while loading or when there is nothing to review.
 */
const HireHeadlineReview: React.FC = () => {
  const [drafts, setDrafts] = useState<HeadlineDraft[] | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDrafts(await fetchHeadlineDrafts());
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 401 || status === 403) setHidden(true);
      else setErr('Could not load the Hire headline changes.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (d: HeadlineDraft, decision: HeadlineDecision) => {
    setBusy(d.enrollmentId); setErr(null); setMsg(null);
    try {
      await decideHeadline(d.enrollmentId, decision, d.draft);
      setMsg(decision === 'approve' ? `${d.name}'s Hire headline is now "${d.draft}".` : `Declined. ${d.name}'s headline stays as it is.`);
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Could not record that decision.');
    } finally {
      setBusy(null);
      load();
    }
  };

  if (hidden) return null;
  if (err && drafts === null) return <div className="cr-banner err" role="alert">{err}</div>;
  if (!drafts || (!drafts.length && !msg)) return null;

  return (
    <section className="cr-group" aria-labelledby="cr-hire-headlines" data-testid="hire-headlines">
      <h2 className="cr-h2" id="cr-hire-headlines">Hire headline changes ({drafts.length})</h2>
      {msg && <div className="cr-banner ok" role="status">{msg}</div>}
      {err && <div className="cr-banner err" role="alert">{err}</div>}
      {drafts.map((d) => (
        <article className="cr-card" key={d.enrollmentId} data-testid={`hire-headline-${d.enrollmentId}`}>
          <div className="cr-card-head">
            <div>
              <div className="cr-name">{d.name || 'Unnamed learner'}</div>
              {d.slug && <div className="cr-muted cr-mono">hire.refactored.ai/talent/{d.slug}/</div>}
            </div>
            <div className="cr-muted">asked {new Date(d.updatedAt).toLocaleDateString()}</div>
          </div>
          <dl className="cr-headline">
            <dt>Today</dt><dd>{d.live || <span className="cr-muted">No headline</span>}</dd>
            <dt>Proposed</dt><dd><b>{d.draft}</b></dd>
          </dl>
          <div className="cr-actions cr-headline-acts">
            <button type="button" className="cr-btn ok" disabled={busy !== null} onClick={() => decide(d, 'approve')} data-testid="hire-headline-approve">
              Approve headline
            </button>
            <button type="button" className="cr-btn ghost" disabled={busy !== null} onClick={() => decide(d, 'reject')} data-testid="hire-headline-reject">
              Decline
            </button>
          </div>
        </article>
      ))}
    </section>
  );
};

export default HireHeadlineReview;
