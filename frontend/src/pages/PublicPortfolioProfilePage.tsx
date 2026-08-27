import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import portalApi from '../utils/portalApi';

/**
 * PublicPortfolioProfilePage — /u/:slug, the person rather than one project.
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

// Design tokens, not hex literals: the tokens carry a [data-theme="dark"] variant and
// this is a page a stranger opens on an unknown device.
const INK = 'var(--text-strong)';
const BODY = 'var(--text-body)';
const ACCENT = 'var(--text-link)';
const MUTED = 'var(--text-muted)';
const LINE = 'var(--border-subtle)';

interface Capability {
  name: string;
  evidence_level: 'colaberry_verified' | 'delivery_verified';
  evidence_count: number;
  last_demonstrated_at: string | null;
}
interface RecordLink { slug: string; title: string; published_at: string | null }
interface Repository { name: string; url: string }

interface Portfolio {
  identity: {
    full_name: string; headline: string | null; cohort_name: string | null;
    avatar_data_url: string | null; linkedin_url: string | null;
  };
  capabilities: Capability[];
  records: RecordLink[];
  repositories: Repository[];
  private_repository_count: number;
  generated_at: string;
}

/** Delivery-verified outranks Colaberry-verified: it means it survived real use. */
const LEVEL_LABEL: Record<Capability['evidence_level'], string> = {
  delivery_verified: 'Verified in delivery',
  colaberry_verified: 'Verified by Colaberry',
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section style={{ marginTop: 40 }}>
    <h2 style={{
      fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase',
      color: MUTED, fontWeight: 700, margin: '0 0 14px',
    }}>{title}</h2>
    {children}
  </section>
);

const PublicPortfolioProfilePage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');

  useEffect(() => {
    let live = true;
    portalApi.get(`/api/public/u/${slug}`)
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

  const { identity, capabilities, records, repositories, private_repository_count } = portfolio;

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '48px 24px 96px', color: BODY }}>
      <header style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        {identity.avatar_data_url && (
          <img
            src={identity.avatar_data_url}
            alt=""
            style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }}
          />
        )}
        <div style={{ minWidth: 220, flex: 1 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: INK, margin: 0 }}>
            {identity.full_name}
          </h1>
          {identity.headline && (
            <div style={{ fontSize: 16, color: BODY, marginTop: 4 }}>{identity.headline}</div>
          )}
          {identity.cohort_name && (
            <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>{identity.cohort_name}</div>
          )}
        </div>
        {identity.linkedin_url && (
          <a
            href={identity.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: ACCENT, fontSize: 14, textDecoration: 'none' }}
          >
            LinkedIn
          </a>
        )}
      </header>

      {capabilities.length > 0 && (
        <Section title={`What they can prove (${capabilities.length})`}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {capabilities.map((c) => (
              <li
                key={c.name}
                style={{
                  display: 'flex', justifyContent: 'space-between', gap: 12,
                  padding: '10px 0', borderBottom: `1px solid ${LINE}`, flexWrap: 'wrap',
                }}
              >
                <span style={{ color: INK, fontWeight: 600 }}>{c.name}</span>
                <span style={{ color: MUTED, fontSize: 13 }}>
                  {LEVEL_LABEL[c.evidence_level]}
                  {' · '}
                  {c.evidence_count} piece{c.evidence_count === 1 ? '' : 's'} of evidence
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {records.length > 0 && (
        <Section title={`What they built (${records.length})`}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {records.map((r) => (
              <li key={r.slug} style={{ padding: '10px 0', borderBottom: `1px solid ${LINE}` }}>
                {/* The record is where the depth lives; this page is the index. */}
                <a href={`/p/${r.slug}`} style={{ color: ACCENT, fontWeight: 600, textDecoration: 'none' }}>
                  {r.title}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(repositories.length > 0 || private_repository_count > 0) && (
        <Section title="Code">
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {repositories.map((r) => (
              <li key={r.url} style={{ padding: '8px 0' }}>
                <a href={r.url} target="_blank" rel="noopener noreferrer"
                   style={{ color: ACCENT, textDecoration: 'none' }}>{r.name}</a>
              </li>
            ))}
          </ul>
          {private_repository_count > 0 && (
            // The honest statement -- there was more work behind this -- without the identity.
            <p style={{ color: MUTED, fontSize: 13, margin: '8px 0 0' }}>
              and {private_repository_count} private {private_repository_count === 1 ? 'repository' : 'repositories'}
            </p>
          )}
        </Section>
      )}

      {/* An entirely empty portfolio is a real state and says so plainly, rather than
          rendering a page of blank headings that reads as abandonment. */}
      {!capabilities.length && !records.length && !repositories.length && (
        <p style={{ color: MUTED, marginTop: 40 }}>
          This portfolio does not have any published work yet.
        </p>
      )}
    </div>
  );
};

export default PublicPortfolioProfilePage;
