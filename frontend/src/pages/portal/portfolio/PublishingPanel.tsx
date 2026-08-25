import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchPublicationStatus, requestReview, setVisibility,
  CapstoneReviewStatus, RecordVisibility,
} from '../../../services/careerApi';

/**
 * PublishingPanel — the learner's half of publication.
 *
 * The public page itself is the Capstone Record at /p/:slug (see the convergence note in
 * capstoneReviewService). This panel drives the governance around it: ask a human to
 * review, see what they said, and choose who may see an approved record.
 *
 * TWO CONTROLS, DELIBERATELY SEPARATE:
 *   "Request review"  -> earned. A mentor decides whether the work is publishable.
 *   Visibility        -> always the learner's. Approval never changes it.
 *
 * If approving also made someone public, a reviewer saying "this is good work" would
 * silently make a learner searchable. So the two never touch.
 */

const VIS_COPY: Record<RecordVisibility, { label: string; detail: string }> = {
  private: { label: 'Only me', detail: 'Nobody else can open it, even with the link.' },
  unlisted: { label: 'Anyone with the link', detail: 'Not indexed by search engines. Share it yourself.' },
  public: { label: 'Public and searchable', detail: 'Search engines may index it. This is the only setting that allows that.' },
};

const PublishingPanel: React.FC = () => {
  const [status, setStatus] = useState<CapstoneReviewStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchPublicationStatus().then(setStatus).catch(() => setStatus(null));
  }, []);
  useEffect(load, [load]);

  const ask = async () => {
    setBusy(true); setErr(null);
    try { await requestReview(); load(); }
    catch (e: any) { setErr(e?.response?.data?.error || 'Could not send that for review.'); }
    finally { setBusy(false); }
  };

  const changeVisibility = async (v: RecordVisibility) => {
    setBusy(true); setErr(null);
    try { await setVisibility(v); load(); }
    catch (e: any) { setErr(e?.response?.data?.error || 'Could not change who can see it.'); }
    finally { setBusy(false); }
  };

  /**
   * NO CLIENT-SIDE GATE on requesting review.
   *
   * This button was originally disabled whenever `profile.readiness.blocking` was
   * non-empty. That was wrong twice over. Those counts are CAREER-portfolio readiness
   * (verified capabilities, build artifacts); what is being reviewed here is a CAPSTONE
   * RECORD compiled from a project, which is a different artifact. And the server has no
   * such gate — `requestCapstoneReview` only refuses if there is no record or it is
   * already published.
   *
   * So the UI was locking a door the API leaves open, and a learner with a perfectly
   * reviewable record saw a dead button (reported by Ali, 2026-08-25). The server decides;
   * this renders the outcome.
   */

  return (
    <div className="cp-publishing">
      {err && <div className="cp-degraded" role="alert">{err}</div>}

      {/* ── no record yet ── */}
      {status?.state === 'no_record' && (
        <section className="cp-card">
          <h2>No capstone record yet</h2>
          <p className="cp-muted">
            Your record is built from your capstone project. Once you have one, it appears here
            and you can send it for review.
          </p>
        </section>
      )}

      {/* ── draft: ask for review ── */}
      {(status?.state === 'draft' || status?.state === 'changes_requested') && (
        <section className="cp-card">
          <h2>{status.state === 'changes_requested' ? 'Your reviewer asked for changes' : 'Ready to be reviewed?'}</h2>

          {status.state === 'changes_requested' && status.last_review?.notes && (
            <div className="cp-note-block" role="note">{status.last_review.notes}</div>
          )}

          <p className="cp-muted">
            A mentor will read the exact version you send and either approve it or come back
            with changes. Keep building in the meantime — what they see stays as you sent it.
          </p>
          <div className="cp-row-actions">
            <button type="button" className="cp-btn cp-btn-primary" onClick={ask} disabled={busy}>
              {busy ? 'Sending…' : 'Request review'}
            </button>
          </div>
        </section>
      )}

      {/* ── in review ── */}
      {status?.state === 'in_review' && (
        <section className="cp-card">
          <h2>Awaiting review</h2>
          <p className="cp-muted">
            You sent <strong>version {status.version}</strong>. A mentor will approve it or come
            back with changes.
          </p>
          <p className="cp-note">
            Carry on building. Your record keeps growing; what your reviewer sees stays exactly as
            you submitted it.
          </p>
        </section>
      )}

      {/* ── published ── */}
      {status?.state === 'published' && (
        <section className="cp-card">
          <h2>Your record is live</h2>
          <p className="cp-muted">Approved at version {status.version}.</p>
          {status.public_url && (
            <div className="cp-note-block">
              <strong>enterprise.colaberry.ai{status.public_url}</strong>
            </div>
          )}
        </section>
      )}

      {/* ── visibility: the learner's own choice ── */}
      {status && status.state !== 'no_record' && (
        <section className="cp-card" aria-labelledby="cp-vis-h">
          <h2 id="cp-vis-h">Who can see it</h2>
          <p className="cp-muted">
            This is yours to set, and it is separate from review. A mentor approves that the work
            is ready; you decide the audience.
          </p>
          <ul className="cp-vis">
            {(Object.keys(VIS_COPY) as RecordVisibility[]).map((v) => (
              <li key={v}>
                <button
                  type="button"
                  className={`cp-vis-opt${status.visibility === v ? ' on' : ''}`}
                  aria-pressed={status.visibility === v}
                  disabled={busy}
                  onClick={() => changeVisibility(v)}
                >
                  <span className="cp-vis-label">{VIS_COPY[v].label}</span>
                  <span className="cp-vis-detail">{VIS_COPY[v].detail}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="cp-note">
            Default is “anyone with the link”, which search engines are told to ignore. Only you
            can change that.
          </p>
        </section>
      )}
    </div>
  );
};

export default PublishingPanel;
