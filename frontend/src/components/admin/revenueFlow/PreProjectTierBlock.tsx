import React from 'react';
import type { PreProjectTier } from './flowBoardTypes';

/**
 * R12 — the government pipeline behind the pipeline, drawn as a count and nothing else.
 *
 * Ali's ticket asked for the assessment-stage rows to be "shown as pipeline-behind-pipeline
 * instead of being invisible", with an explicit gate: find out WHY they have no project
 * before linking any of them. The answer, measured on production, is that a delivery project
 * is created when a bid is approved for pursuit, so these rows have none BY DESIGN — 0 of 246
 * rows at the two pre-approval stages has ever carried one. The ticket's branch for that case
 * is this: render them "as a count with no names rather than pretending they are nameable
 * opportunities."
 *
 * ── SO THIS COMPONENT CANNOT SHOW A NAME, AND CANNOT SHOW A FIGURE ───────────────────────
 *
 * `PreProjectTier` has no list of rows and no `Money` field. Both absences are deliberate and
 * structural rather than a thing this component chooses not to render:
 *
 *   - No names, because none exist. These rows carry an internal opportunity id and nothing
 *     else: no snapshot of the opportunity, and no recorded alias. Printing that id would
 *     look like a name without being one, and guessing at which opportunity a row belongs to
 *     is what the ticket forbids outright, because a wrongly attached bid misattributes its
 *     evidence later.
 *   - No figure, because `gov_qualifications` holds no value column. A count of unassessed
 *     opportunities next to a dollar amount is how this tier would get read as pipeline.
 *
 * ── WHY A STAT TILE AND NOT A CHART ──────────────────────────────────────────────────────
 *
 * It is one number with no series and no comparison. A chart would be decoration that implied
 * a trend nobody measured; the count, what it counts, and why it has no names is the whole
 * finding.
 */
export default function PreProjectTierBlock({
  streamKey, tier,
}: {
  streamKey: string;
  tier: PreProjectTier;
}) {
  return (
    <div
      className="rounded border p-3 mb-3"
      style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-card)' }}
      data-testid={`pre-project-${streamKey}`}
    >
      <div className="d-flex align-items-baseline gap-3 flex-wrap">
        <div
          className="fw-bold"
          style={{ fontSize: 26, lineHeight: 1.1, color: 'var(--text-primary)' }}
          data-testid={`pre-project-count-${streamKey}`}
        >
          {tier.count}
        </div>
        <div className="fw-semibold" style={{ fontSize: 14 }}>{tier.label}</div>
      </div>

      <div className="small text-muted mt-2">{tier.definition}</div>

      {/*
        The honest part, and the reason the block exists at all. A count on its own would
        invite the reader to ask which opportunities these are; this says why that question
        has no answer yet, so the gap reads as a known gap rather than as a page that forgot
        to load the names.
      */}
      <div className="small mt-2" data-testid={`pre-project-why-${streamKey}`}>
        {tier.whyNoNames}
      </div>

      <div className="small text-muted mt-2" data-testid={`pre-project-unlock-${streamKey}`}>
        {tier.unlockedBy}
      </div>

      {/*
        Rendered only when the lifecycle has actually changed under us. The backend expects
        zero linked rows at this stage; if one appears, saying nothing would leave the copy
        above claiming none can be named while one plainly can.
      */}
      {tier.linkedCount > 0 && (
        <div
          className="small mt-2"
          style={{ color: 'var(--status-warning)' }}
          data-testid={`pre-project-linked-${streamKey}`}
        >
          {tier.linkedCount === 1
            ? '1 of these now carries a delivery project, which this stage did not use to do. '
              + 'The pipeline above is the place a linked opportunity belongs.'
            : `${tier.linkedCount} of these now carry a delivery project, which this stage did `
              + 'not use to do. The pipeline above is the place a linked opportunity belongs.'}
        </div>
      )}

      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>
        {tier.provenance}
      </div>
    </div>
  );
}
