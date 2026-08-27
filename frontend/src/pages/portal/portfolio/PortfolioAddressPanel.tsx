import React, { useEffect, useState } from 'react';
import {
  fetchPortfolioPage,
  setPortfolioPageVisibility,
  requestPortfolioPageReview,
  type PortfolioPageState,
  type PortfolioPageVisibility,
} from '../../../services/careerApi';

/**
 * PortfolioAddressPanel — the learner's controls for their person-level page at /u/:slug.
 *
 * DISTINCT FROM THE RECORD'S PUBLISHING PANEL, which governs one project at /p/:slug.
 * This governs the page that indexes all of them. They are separate approvals on purpose:
 * a learner can have a published record while their portfolio is still private, and
 * revoking one must not revoke the other.
 *
 * WHY VISIBILITY IS ALWAYS EDITABLE, EVEN BEFORE APPROVAL. Status and visibility are
 * independent axes and both must pass, so choosing `public` on an unapproved page changes
 * nothing a stranger can see. Disabling the control before approval would suggest the
 * audience is somebody else's decision, and it is not — a mentor approves that the work
 * is ready, the learner decides who sees it.
 *
 * THE ADDRESS IS SHOWN EVEN WHILE THE PAGE IS INVISIBLE, so the learner knows what they
 * are being given. It is presented as text rather than a live link until it resolves,
 * because handing someone a link that 404s reads as a broken feature.
 */

const OPTIONS: Array<{ value: PortfolioPageVisibility; label: string; help: string }> = [
  { value: 'private', label: 'Only me', help: 'Nobody else can open it, even with the link.' },
  { value: 'unlisted', label: 'Anyone with the link', help: 'Not indexed by search engines. Share it yourself.' },
  { value: 'public', label: 'Public and searchable', help: 'Search engines may index it. This is the only setting that allows that.' },
];

const PortfolioAddressPanel: React.FC = () => {
  const [page, setPage] = useState<PortfolioPageState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchPortfolioPage()
      .then((p) => { if (live) setPage(p); })
      .catch(() => { if (live) setError('Could not load your portfolio address.'); });
    return () => { live = false; };
  }, []);

  const run = async (fn: () => Promise<PortfolioPageState>) => {
    setBusy(true);
    setError(null);
    try {
      setPage(await fn());
    } catch {
      setError('That did not save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (error && !page) return <p className="cp-muted">{error}</p>;
  if (!page) return <p className="cp-muted">Loading…</p>;

  const isLive = page.status === 'published' && page.visibility !== 'private';
  const awaitingReview = !!page.review_requested_at && page.status !== 'published';

  return (
    <section className="cp-card">
      <h3 className="cp-card-h">Your portfolio page</h3>
      <p className="cp-muted" style={{ marginTop: 0 }}>
        One page for everything you have built, separate from each individual record.
      </p>

      <div className="cp-address">
        {isLive
          ? <a href={page.public_path} target="_blank" rel="noopener noreferrer">enterprise.colaberry.ai{page.public_path}</a>
          /* Not a link until it resolves: handing someone a link that 404s reads as broken. */
          : <span className="cp-mono">enterprise.colaberry.ai{page.public_path}</span>}
      </div>

      {/* The shipping state, said plainly. "Approved" and "shared" are different things
          and the learner needs to know which one is missing. */}
      <p className="cp-state">
        {isLive && <>Live. Approved{page.approved_at ? ` on ${new Date(page.approved_at).toLocaleDateString()}` : ''}.</>}
        {!isLive && page.status === 'published' && <>Approved, but set to “Only me”, so nobody can open it.</>}
        {!isLive && awaitingReview && <>Waiting on a mentor to review it.</>}
        {!isLive && page.status !== 'published' && !awaitingReview && <>Not published yet.</>}
      </p>

      {page.status !== 'published' && (
        <button
          className="cp-btn"
          disabled={busy || awaitingReview}
          onClick={() => run(requestPortfolioPageReview)}
        >
          {awaitingReview ? 'Review requested' : 'Ask for review'}
        </button>
      )}

      <h4 className="cp-sub">Who can see it</h4>
      <p className="cp-muted" style={{ marginTop: 0 }}>
        This is yours to set, and it is separate from review. A mentor approves that the
        work is ready; you decide the audience.
      </p>
      <div className="cp-choices">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`cp-choice${page.visibility === o.value ? ' is-current' : ''}`}
            disabled={busy}
            onClick={() => run(() => setPortfolioPageVisibility(o.value))}
          >
            <span className="cp-choice-l">
              {o.label}{page.visibility === o.value && <em> — current</em>}
            </span>
            <span className="cp-choice-h">{o.help}</span>
          </button>
        ))}
      </div>

      <p className="cp-fine">
        Default is “anyone with the link”, which search engines are told to ignore. Only you can change that.
      </p>

      {error && <p className="cp-error">{error}</p>}
    </section>
  );
};

export default PortfolioAddressPanel;
