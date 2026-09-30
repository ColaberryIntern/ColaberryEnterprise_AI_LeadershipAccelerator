import React from 'react';
import { Button } from '../../colaberry/components/core/Button';
import { Badge } from '../../colaberry/components/core/Badge';
import { BOOK } from '../../data/capabilityModel';

/**
 * Authority band anchored on Ram Katamaraja's book "Trust Before Intelligence".
 * Uses the real cover image (public/img/book-cover.jpg). Colaberry DS idiom.
 */
export default function AuthorityStrip() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(120px, 176px) 1fr',
        gap: 'var(--space-8)',
        alignItems: 'center',
        background: 'var(--surface-card)',
        border: 'var(--border-1) solid var(--border-subtle)',
        borderRadius: 'var(--radius-2xl)',
        boxShadow: 'var(--shadow-lg)',
        padding: 'var(--space-8)',
      }}
      className="cb-authority"
    >
      <img
        src={BOOK.coverSrc}
        alt={`Cover of ${BOOK.title} by ${BOOK.author}`}
        style={{
          width: '100%',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-xl)',
          display: 'block',
        }}
        loading="lazy"
      />
      <div>
        <Badge tone="blue" style={{ marginBottom: 'var(--space-4)' }}>From the book</Badge>
        <p
          className="cb-balance"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 900,
            fontSize: 'var(--fs-h3)',
            lineHeight: 'var(--lh-heading)',
            letterSpacing: 'var(--ls-tight)',
            color: 'var(--text-strong)',
            margin: '0 0 var(--space-3)',
          }}
        >
          95% of AI pilots fail. This platform is how the 5% succeed.
        </p>
        <p style={{ fontSize: 'var(--fs-body)', lineHeight: 'var(--lh-relaxed)', color: 'var(--text-muted)', margin: '0 0 var(--space-5)' }}>
          <em>{BOOK.title}: {BOOK.subtitle}</em> &mdash; by {BOOK.author}, {BOOK.authorTitle}. The
          frameworks in the book are what the platform runs on.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', alignItems: 'center' }}>
          <Button as="a" href={BOOK.amazonUrl} variant="outline" size="sm" data-track="authority_book_amazon">
            Read the book
          </Button>
        </div>
      </div>
      <style>{`
        @media (max-width: 640px) {
          .cb-authority { grid-template-columns: 1fr !important; justify-items: center; text-align: center; }
          .cb-authority > img { max-width: 180px; }
        }
      `}</style>
    </div>
  );
}
