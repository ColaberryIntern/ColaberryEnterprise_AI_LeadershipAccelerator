import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { setMyWorkFeatured } from '../../../../services/myWorkApi';

/**
 * "Who can see it", with the Feature switch (C130, phase 3 of the approved C127 design). The rule Ali chose (11 Nov 2026,
 * "After review"): featuring shows the piece on the learner's Preview at once and on the public page only after a reviewer
 * approves the page. The three honest states, never more than is true:
 *   not featured                     only you (and staff who support you)
 *   featured, not on the public page Preview now; public after your next review (with the way to ask)
 *   featured and on the public page  strangers with your page's link can open it
 */
export interface FeatureState { featured: boolean; onPublicPage: boolean }

export default function FeatureCard({ id, initial, onChange }: { id: string; initial: FeatureState; onChange?: (s: FeatureState) => void }): React.ReactElement {
  const [s, setS] = useState<FeatureState>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = (): void => {
    setBusy(true); setError(null);
    setMyWorkFeatured(id, !s.featured)
      .then((r) => { const next = { featured: r.featured, onPublicPage: r.onPublicPage }; setS(next); onChange?.(next); })
      .catch((e: { response?: { status?: number; data?: { error?: string } } }) => {
        setError(e?.response?.status === 409 ? (e.response.data?.error ?? 'You have featured the most pieces allowed.') : 'Could not change this piece. Try again.');
      })
      .finally(() => setBusy(false));
  };
  return (
    <div className="cp-card" data-testid="mw-feature">
      <h2>Who can see it</h2>
      {!s.featured && <p className="cp-muted">Only you. Colaberry staff can open it to support you. Nothing here is on a public page.</p>}
      {s.featured && !s.onPublicPage && (
        <p className="cp-muted">Featured. It shows on your <Link to="/portal/portfolio/preview">Preview</Link> now, and on your public page after your next review. <Link to="/portal/portfolio">Ask for review on the Publishing tab.</Link></p>
      )}
      {s.featured && s.onPublicPage && <p className="cp-muted">Featured and on your public page: anyone with your page&apos;s link can open it.</p>}
      <button type="button" className={`cp-btn${s.featured ? '' : ' cp-btn-primary'}`} onClick={toggle} disabled={busy} aria-pressed={s.featured}>
        {s.featured ? '★ Featured · Unfeature' : '☆ Feature on my public page'}
      </button>
      {error && <p className="cp-note" role="alert">{error}</p>}
    </div>
  );
}
