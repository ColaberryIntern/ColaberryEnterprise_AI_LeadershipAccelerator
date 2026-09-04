import React, { useEffect, useState } from 'react';
import { fetchMyPortfolioPreview } from '../../../services/careerApi';
import PortfolioBody, { type Portfolio } from '../../../components/portfolio/PortfolioBody';

/**
 * PortfolioPreviewPage — /portal/portfolio/preview, the learner's own page as a PAGE.
 *
 * WHY A ROUTE AND NOT AN EXPANDER. The preview started life inline in the Publishing tab,
 * behind a show/hide toggle. Ali: "when I click on the new tab, I was expecting it to open
 * the page. We already have a gate — don't need another one with that button." He is
 * right: the portfolio is already governed by approval and visibility, and making someone
 * expand a panel to see it was a second gate that governed nothing.
 *
 * WHY NOT JUST LINK THE PUBLIC URL. Because it only resolves once the page is live, and
 * most learners will click this BEFORE that is true. Sending them to a 404 to prove their
 * page exists is worse than any preview. This route serves the same payload the public
 * page serves — through the same allow-list and the same component — for the one person
 * entitled to see it early. Once the page IS live, the address above this button is a
 * real link to the real thing, so nothing here duplicates it.
 *
 * It renders PortfolioBody WITHOUT `embedded`: this is a page, so it gets the page
 * furniture — the Refactored nav and the full-height ground — exactly as a stranger will.
 */
const PortfolioPreviewPage: React.FC = () => {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchMyPortfolioPreview()
      .then((p) => { if (live) setPortfolio(p); })
      .catch(() => { if (live) setError('Could not load your page just now.'); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    // A tab opened on its own needs to say what it is; the portfolio itself carries no
    // title of its own because the public page sets one from the learner's name.
    document.title = 'Preview your portfolio page';
  }, []);

  if (error) {
    return <p style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>{error}</p>;
  }
  if (!portfolio) {
    return <p style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</p>;
  }

  return (
    <>
      {/* Says plainly that this is not yet the published article, and does it OUTSIDE the
          portfolio so the rendering below stays byte-identical to what publishes. */}
      <div
        style={{
          background: '#1e3a8a', color: '#fff', textAlign: 'center',
          padding: '9px 16px', fontSize: 13.5, fontWeight: 600,
        }}
      >
        Preview — this is exactly what a reviewer, and then a stranger, will see.
      </div>
      <PortfolioBody portfolio={portfolio} />
    </>
  );
};

export default PortfolioPreviewPage;
