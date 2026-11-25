import React from 'react';
import type { BrandGroup } from './flowBoardTypes';

/**
 * One brand heading above the stream cards filed under it. R25 Phase 2.
 *
 * ── WHY THE BUCKET IS NOT DRAWN AS A BRAND ───────────────────────────────────────────────
 *
 * `isBrand: false` marks the "No brand yet" group, which holds the declared-but-unbuilt bets.
 * It gets no link and no brand styling, because a reader skimming four identical headings
 * would come away believing Colaberry has four brands, one of which is called "No brand yet".
 * It is a bucket for things whose brand is undecided, and several of them would be new brands
 * if they were ever set up.
 *
 * ── WHY AN UNRESOLVED NAME SAYS SO ON THE HEADING ────────────────────────────────────────
 *
 * The brand's name and URL are read from the `brands` table, which the Brands admin page also
 * renders from. When that read fails the backend falls back to a name in code and sets
 * `resolved: false`. Printing the fallback silently would mean two screens showing a brand
 * under two different names with nothing saying which is current — the duplicate-source-of
 * -truth failure this repo keeps paying for. So the heading carries the admission.
 */
export default function BrandHeading({
  brand, streamCount,
}: {
  brand: BrandGroup;
  /** How many of this brand's streams are actually rendered below, after filtering. */
  streamCount: number;
}) {
  return (
    <div className="d-flex flex-wrap align-items-baseline gap-2 mb-2 mt-1" data-testid={`brand-heading-${brand.key}`}>
      <h2 className="h6 mb-0" style={{ color: brand.isBrand ? 'var(--text-primary)' : 'var(--text-muted)' }}>
        {brand.label}
      </h2>

      {/* Not a brand, and said so in words rather than left to the lighter grey. */}
      {!brand.isBrand && (
        <span className="small text-muted" data-testid={`brand-not-a-brand-${brand.key}`}>
          (not a brand)
        </span>
      )}

      <span className="small text-muted">
        {streamCount === 1 ? '1 stream' : `${streamCount} streams`}
      </span>

      {brand.isBrand && brand.url && (
        <a
          href={brand.url}
          target="_blank"
          rel="noreferrer"
          className="small text-decoration-none"
          data-testid={`brand-link-${brand.key}`}
        >
          {brand.url.replace(/^https?:\/\//, '')}
        </a>
      )}

      {brand.isBrand && !brand.resolved && (
        <span className="small" style={{ color: 'var(--status-warning)' }} data-testid={`brand-unresolved-${brand.key}`}>
          Name may be out of date
        </span>
      )}

      {brand.note && (
        <div className="small text-muted w-100" data-testid={`brand-note-${brand.key}`}>{brand.note}</div>
      )}
    </div>
  );
}
