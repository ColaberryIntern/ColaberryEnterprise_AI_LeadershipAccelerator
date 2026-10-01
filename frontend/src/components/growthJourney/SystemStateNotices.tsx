import React from 'react';
import EmptyState from '../admin/shell/EmptyState';

/**
 * The two states a Growth Journey screen must be able to NAME (Phase 6, T613).
 *
 * Extracted from `GrowthJourneyPage` rather than inlined, for two reasons. The
 * page was over its line budget with them in it; and these are the states most
 * likely to be true on any given day, so they deserve a unit a test can render
 * on its own rather than only through a page with four mocked reads.
 *
 * A dark system, an unseeded one and a working one produce identical screens if
 * you only render rows. Both notices below exist because the difference is
 * invisible otherwise, and both name the exact thing to change - a flag or a
 * script - rather than describing a symptom.
 */

export interface Props {
  /** The master switch is off: every journey route answers "Not found". */
  off: boolean;
  /** No tenant memberships are seeded: every scoped read returns nothing. */
  unseeded: boolean;
}

export default function SystemStateNotices({ off, unseeded }: Props) {
  return (
    <>
      {off && (
        <div className="alert alert-secondary d-flex align-items-start gap-2 mt-3" role="status">
          <i className="ri-moon-line fs-5" aria-hidden="true" />
          <div>
            <strong>Growth Journey is switched off.</strong>{' '}
            <code>GROWTH_JOURNEY_ENABLED</code> is not set, so every journey route answers
            &ldquo;Not found&rdquo; and nothing classifies, decides or sends. This page reads the
            status registry, which answers either way &mdash; so what you see is configuration,
            not activity.
          </div>
        </div>
      )}

      {unseeded && (
        <div className="mt-3">
          <EmptyState
            icon="user-settings-line"
            title="No tenant memberships are seeded"
            description={
              <>
                Every journey read is scoped by the caller&rsquo;s memberships, so with none seeded
                <strong> every admin sees an empty system that looks exactly like a working one</strong>.
                Run <code>seedTenantMemberships</code> before reading anything here as a real answer.
              </>
            }
          />
        </div>
      )}
    </>
  );
}
