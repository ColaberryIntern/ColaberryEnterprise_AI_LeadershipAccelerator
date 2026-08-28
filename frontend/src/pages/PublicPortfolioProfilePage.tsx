import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import portalApi from '../utils/portalApi';

/**
 * PublicPortfolioProfilePage — /portfolio/:slug, the person rather than one project.
 *
 * THE DIVISION OF LABOUR WITH /p/:slug. A Capstone Record answers "here is the one
 * system I built", in depth. This page answers "here is who I am across thirteen weeks",
 * and links out to each record for the depth. It is an index, not a second record, which
 * is why it stores no compiled content of its own.
 *
 * RENDERS ONLY WHAT THE PAYLOAD CARRIES. No placeholder copy, no "coming soon" band, no
 * empty state dressed up as progress. A section with nothing behind it is not drawn.
 * A reader who finds one padded section reasonably discounts every other claim, and this
 * page exists to be believed.
 *
 * THE BACKEND ALREADY DECIDED WHAT IS PUBLIC. `careerPortfolioPublicProjection` is a
 * named-field allow-list, so this component receives only publishable fields — there is
 * nothing here to filter and nothing to accidentally render. If a field is absent it is
 * absent by design, not by oversight.
 *
 * A 404 IS A REAL ANSWER. Unknown slug and "exists but not viewable" are indistinguishable
 * on purpose, so this page must not distinguish them either — it says the same thing for
 * both, and never "this portfolio is private", which would confirm the person exists.
 */

import PortfolioBody, { type Portfolio } from '../components/portfolio/PortfolioBody';

const MUTED = 'var(--text-muted)';
const INK = 'var(--text-strong)';
const BODY = 'var(--text-body)';

const PublicPortfolioProfilePage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');

  useEffect(() => {
    let live = true;
    portalApi.get(`/api/public/portfolios/${slug}`)
      .then((res: any) => {
        if (!live) return;
        setPortfolio(res.data.portfolio);
        setState('ready');
      })
      .catch((e: any) => {
        if (!live) return;
        // 404 is a legitimate answer here, not a failure worth an error page.
        setState(e?.response?.status === 404 ? 'missing' : 'error');
      });
    return () => { live = false; };
  }, [slug]);

  if (state === 'loading') {
    return <div style={{ padding: 60, textAlign: 'center', color: MUTED }}>Loading…</div>;
  }

  if (state === 'missing' || !portfolio) {
    return (
      <div style={{ padding: '80px 24px', textAlign: 'center', color: BODY }}>
        <h1 style={{ fontSize: 22, color: INK, marginBottom: 8 }}>Nothing here</h1>
        {/* Deliberately says nothing about whether a person by this name exists. */}
        <p style={{ color: MUTED }}>This address does not lead to a portfolio.</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div style={{ padding: '80px 24px', textAlign: 'center', color: BODY }}>
        <h1 style={{ fontSize: 22, color: INK, marginBottom: 8 }}>Something went wrong</h1>
        <p style={{ color: MUTED }}>Please try again in a moment.</p>
      </div>
    );
  }

  return <PortfolioBody portfolio={portfolio} />;
};

export default PublicPortfolioProfilePage;
