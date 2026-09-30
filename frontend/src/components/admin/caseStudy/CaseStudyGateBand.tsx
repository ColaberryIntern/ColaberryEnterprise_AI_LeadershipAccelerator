import React from 'react';
import type { CaseStudyPublishBlocker } from '../../../services/caseStudyAdminTypes';

/**
 * CaseStudyGateBand — the publish gate's refusals, on every tab.
 *
 * THIS COMPONENT IS THE REASON TABS ARE SAFE HERE.
 *
 * The detail page used to be one long scroll, and its header comment said why:
 * "Splitting that into tabs would let a reviewer approve a record having seen a
 * third of it." Tabs arrived with the Story Studio because authoring has an
 * order that a flat page cannot express. This band is what replaces the
 * protection the scroll used to provide — the gate's named refusals are
 * rendered ABOVE the tab strip and are therefore on screen whichever tab is
 * open. A reviewer can be on Visuals and still be looking at the reason this
 * record cannot ship.
 *
 * IT SUMMARISES AND NEVER SOFTENS. The count is the real count, each blocker is
 * named by its own code and field, and there is no "mostly ready" state. The
 * full remedy text lives in `CaseStudyPublishPanel` on the Publish tab; this is
 * the part that must not be escapable, not a replacement for reading it.
 *
 * WHEN THE GATE ALLOWS, IT SAYS SO PLAINLY AND STAYS VISIBLE. An empty band
 * would make "no blockers" and "not yet evaluated" render identically, which is
 * the same class of bug as an empty list meaning both "no results" and "the
 * request failed".
 */

interface Props {
  blockers: readonly CaseStudyPublishBlocker[];
  /** Where the verdict came from, so nobody reads a stale one as current. */
  source: 'publish' | 'preview' | null;
  /** True before any gate verdict has been received at all. */
  unknown: boolean;
}

export default function CaseStudyGateBand({
  blockers, source, unknown,
}: Props): React.ReactElement {
  if (unknown) {
    return (
      <div className="alert alert-secondary py-2 mb-3" data-testid="cs-gate-band">
        <strong>Publish gate: not yet evaluated.</strong>{' '}
        <span className="small">
          No verdict has been received for this record in this session. This is not the same as
          &ldquo;no blockers&rdquo;.
        </span>
      </div>
    );
  }

  if (blockers.length === 0) {
    return (
      <div className="alert alert-success py-2 mb-3" data-testid="cs-gate-band">
        <strong>Publish gate: no refusals.</strong>{' '}
        <span className="small">
          Every rule evaluated and none objected{source ? ` (from the last ${source})` : ''}. A
          clear gate is permission to publish, never an instruction to.
        </span>
      </div>
    );
  }

  return (
    <div className="alert alert-danger py-2 mb-3" data-testid="cs-gate-band">
      <strong data-testid="cs-gate-band-count">
        Publish gate refuses this record for {blockers.length} named{' '}
        reason{blockers.length === 1 ? '' : 's'}.
      </strong>
      <ul className="mb-0 mt-2 small" data-testid="cs-gate-band-list">
        {blockers.map((blocker, index) => (
          <li key={`${blocker.code}-${blocker.field ?? index}`} data-testid={`cs-gate-band-${blocker.code}`}>
            <code>{blocker.code}</code>
            {blocker.field ? <> &middot; <span className="text-muted">{blocker.field}</span></> : null}
            {' '}&mdash; {blocker.message}
          </li>
        ))}
      </ul>
      <p className="mb-0 mt-2 small">
        Full remedies are on the PUBLISH tab. This band stays on every tab so no decision is made
        without it.
      </p>
    </div>
  );
}
