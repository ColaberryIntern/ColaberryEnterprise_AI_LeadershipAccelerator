import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { setMyWorkFeatured, setMyWorkShared } from '../../../../services/myWorkApi';

/**
 * "Who can see it", with two INDEPENDENT switches (C127 decision Q1 A: Showcase has its own opt-in):
 *
 *   Share with my cohort (C138)       classmates in the learner's own cohort can open it in the Showcase, at once (Ali, 11 Nov
 *                                     2026: own cohort only). Never a public page.
 *   Feature on my public page (C130)  Preview at once; strangers only after a reviewer approves the page ("After review").
 *
 * Each switch calls only its own endpoint, so one can never flip the other. The copy says only what is true, in every
 * combination: with both off it is "Only you"; otherwise each audience gets its own sentence.
 */
export interface FeatureState { featured: boolean; onPublicPage: boolean }
export interface ShareState { shared: boolean }

type Err = { response?: { status?: number; data?: { error?: string } } };

export default function FeatureCard({ id, initial, initialShare = { shared: false }, onChange }: {
  id: string; initial: FeatureState; initialShare?: ShareState; onChange?: (s: FeatureState) => void;
}): React.ReactElement {
  const [s, setS] = useState<FeatureState>(initial);
  const [sh, setSh] = useState<ShareState>(initialShare);
  const [busy, setBusy] = useState<'feature' | 'share' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleFeature = (): void => {
    setBusy('feature'); setError(null);
    setMyWorkFeatured(id, !s.featured)
      .then((r) => { const next = { featured: r.featured, onPublicPage: r.onPublicPage }; setS(next); onChange?.(next); })
      .catch((e: Err) => {
        setError(e?.response?.status === 409 ? (e.response.data?.error ?? 'You have featured the most pieces allowed.') : 'Could not change this piece. Try again.');
      })
      .finally(() => setBusy(null));
  };
  const toggleShare = (): void => {
    setBusy('share'); setError(null);
    setMyWorkShared(id, !sh.shared)
      .then((r) => setSh({ shared: r.shared }))
      .catch(() => setError('Could not change who can see this piece. Try again.'))
      .finally(() => setBusy(null));
  };

  return (
    <div className="cp-card" data-testid="mw-feature">
      <h2>Who can see it</h2>
      {!s.featured && !sh.shared && <p className="cp-muted">Only you. Colaberry staff can open it to support you. Nothing here is on a public page.</p>}

      <h3 className="cp-sub-h">Your cohort</h3>
      {sh.shared
        ? <p className="cp-muted" data-testid="mw-share-state">Shared. Your cohort can open it in the <Link to="/portal/showcase">Showcase</Link>. Only signed-in classmates see it there; the Showcase is never public.</p>
        : <p className="cp-muted" data-testid="mw-share-state">Not in the Showcase: your cohort cannot see it.</p>}
      <button type="button" className={`cp-btn${sh.shared ? '' : ' cp-btn-primary'}`} onClick={toggleShare} disabled={busy !== null}
        aria-pressed={sh.shared} data-testid="sw-share-toggle">
        {sh.shared ? 'Shared with my cohort · Stop sharing' : 'Share with my cohort'}
      </button>

      <h3 className="cp-sub-h">Your public page</h3>
      {!s.featured && <p className="cp-muted">Not on a public page.</p>}
      {s.featured && !s.onPublicPage && (
        <p className="cp-muted">Featured. It shows on your <Link to="/portal/portfolio/preview">Preview</Link> now, and on your public page after your next review. <Link to="/portal/portfolio">Ask for review on the Publishing tab.</Link></p>
      )}
      {s.featured && s.onPublicPage && <p className="cp-muted">Featured and on your public page: anyone with your page&apos;s link can open it.</p>}
      <button type="button" className={`cp-btn${s.featured ? '' : ' cp-btn-primary'}`} onClick={toggleFeature} disabled={busy !== null}
        aria-pressed={s.featured} data-testid="mw-feature-toggle">
        {s.featured ? '★ Featured · Unfeature' : '☆ Feature on my public page'}
      </button>
      {error && <p className="cp-note" role="alert">{error}</p>}
    </div>
  );
}
