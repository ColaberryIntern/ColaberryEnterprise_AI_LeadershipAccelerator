import React from 'react';
import type { BrandGroup } from './flowBoardTypes';

/**
 * R25 Phase 2 — the brand filter, and the sentence that says what a brand means here.
 *
 * Ali, 2026-11-24: "Everything in the revenue tab should be broken down by brand. We can
 * default to Colaberry training but FDE hiring should be connected to hire.refactored.ai
 * brand, Enterprise site sales should be connected to its brand."
 *
 * ── WHY THE STATE IS NOT HELD HERE ───────────────────────────────────────────────────────
 *
 * Choosing a brand scopes the stream cards, the top tiles, the timeline AND the seventeen
 * initiative cards further down the page, which are fetched by a different component from a
 * different endpoint. So "which brand am I looking at" has to be one answer owned above both,
 * and it is: `AdminRevenueRoomPage` holds it and passes it down.
 *
 * The alternative — this bar holding its own state and the cards below holding theirs — would
 * let the page sit in a state where the top says Refactored.ai and the bottom says all
 * brands, with nothing on screen admitting it. That is the failure mode the whole brand
 * breakdown exists to prevent, so it is made structurally impossible rather than avoided by
 * being careful.
 *
 * ── WHY THE BASIS SENTENCE IS NOT COLLAPSIBLE ────────────────────────────────────────────
 *
 * `brandBasis` says that brand is a property of the STREAM and not of each payment, because
 * no revenue table in this database carries a brand. A reader who filters to one brand and
 * reads a figure will otherwise reasonably assume the figure was attributed per payment. The
 * sentence is the difference between a grouping and a claim, so it renders beside the control
 * that does the grouping rather than in a footnote further down.
 */
export default function BrandFilterBar({
  brands, brandFilter, onPickBrand, brandBasis,
}: {
  brands: BrandGroup[];
  brandFilter: string;
  onPickBrand: (key: string) => void;
  brandBasis: string;
}) {
  // Nothing to offer, so nothing is drawn. This is the degraded path: when the backend could
  // not build the grouping it ships an empty list, and the board below renders ungrouped with
  // every stream present. A bar reading "All brands" with no brands behind it would imply the
  // filter works and quietly do nothing.
  if (brands.length === 0) return null;

  const unresolved = brands.filter((b) => b.isBrand && !b.resolved);

  return (
    <div className="card border-0 shadow-sm mb-4" data-testid="brand-filter">
      <div className="card-body p-3">
        <div className="d-flex flex-wrap align-items-center gap-2">
          <strong style={{ fontSize: 12 }}>Brand</strong>
          <button
            type="button"
            className={`btn btn-sm ${brandFilter === '' ? 'btn-secondary' : 'btn-outline-secondary'}`}
            onClick={() => onPickBrand('')}
            data-testid="brand-filter-all"
            aria-pressed={brandFilter === ''}
          >
            All brands
          </button>
          {brands.map((b) => (
            <button
              key={b.key}
              type="button"
              className={`btn btn-sm ${brandFilter === b.key ? 'btn-secondary' : 'btn-outline-secondary'}`}
              onClick={() => onPickBrand(b.key)}
              data-testid={`brand-filter-${b.key}`}
              aria-pressed={brandFilter === b.key}
            >
              {b.label}
              {/*
                The count is the honest antidote to a heading that looks like a measurement.
                A brand with one stream under it is a different thing from a brand with four,
                and the number is what stops "Refactored.ai" reading as a whole business line.
              */}
              <span style={{ fontSize: 10, opacity: 0.75, marginLeft: 5 }}>
                {b.streamKeys.length}
              </span>
            </button>
          ))}
        </div>

        <div className="small text-muted mt-2" data-testid="brand-basis">{brandBasis}</div>

        {/*
          A fallback name presented silently as the brand's real name is the duplicate-source
          -of-truth failure this repo keeps paying for: the Brands admin page would show one
          name and this board another, and nothing on either screen would say which to trust.
        */}
        {unresolved.length > 0 && (
          <div className="small mt-2" style={{ color: 'var(--status-warning)' }} data-testid="brand-unresolved">
            {unresolved.length === 1
              ? `The name "${unresolved[0].label}" could not be read from the brands table, so it `
                + 'comes from a fallback in the code and may be out of date.'
              : `${unresolved.length} brand names could not be read from the brands table, so they `
                + 'come from fallbacks in the code and may be out of date.'}
          </div>
        )}
      </div>
    </div>
  );
}
