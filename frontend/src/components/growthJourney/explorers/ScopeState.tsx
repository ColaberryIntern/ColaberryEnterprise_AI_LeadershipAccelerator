import React from 'react';
import { statusOf } from '../useGrowthJourneyData';
import type { AsyncState } from '../../explorerGrowth/AsyncPanel';
import type { ExplorerBrandScope, ScopedResponse } from '../../../services/growthJourneyExplorerApi';

/**
 * The four honest states of a brand-scoped Explorer panel.
 *
 * ─── THE RULE, STATED SO IT CANNOT BE SOFTENED LATER ────────────────────────
 *
 * **A 403 NEVER FALLS BACK TO DATA.** Not to all-brands, not to cached, not to
 * anything.
 *
 * The first draft of this component broke that rule and would have shipped the
 * exact failure this whole build exists to prevent. It said: on a 403, show
 * "Brand filtering needs tenant memberships. Showing all brands." In production
 * `tenant_memberships` is EMPTY, so selecting Colaberry Enterprise returns 403 -
 * and that fallback would have rendered Colaberry Training's 1,191 learners
 * under the Colaberry Enterprise label, on day one, in the exact state this
 * deploy lands in.
 *
 * The honest answer to "how many learners does Colaberry Enterprise have" when
 * we cannot scope by brand is "we cannot tell you", not "here are someone
 * else's".
 *
 * ─── THE FOUR STATES ────────────────────────────────────────────────────────
 *
 *   1. `unscoped`     no brand selected, 200. The all-brands payload, labelled.
 *   2. `unavailable`  a brand IS selected and the read 403s. ZERO rows.
 *   3. `out_of_scope` 200 with `data: null`. ZERO rows, and says which brand.
 *   4. `failed`       any other error. The error and its class, in red.
 *
 * State 2 is a CONFIGURATION state, not an error, so it is not styled red -
 * nothing is broken and nobody needs to be paged. It still shows nothing.
 *
 * ─── WHY IT BRANCHES ON A STATUS AND NOT ON A MESSAGE ───────────────────────
 *
 * `useGrowthJourneyData` carries the HTTP status on the error. Matching on the
 * message string instead would be a guarantee that breaks the first time
 * somebody rewords a server response, and the reword would turn state 2 into
 * state 4 - a configuration step rendered as a system failure.
 *
 * A status of `null` means the request never reached the server (network,
 * timeout, CORS). That is state 4, deliberately: "we could not ask" is not
 * "memberships are not configured".
 */

export type ScopeStateKind = 'ready' | 'unscoped' | 'unavailable' | 'out_of_scope' | 'failed' | 'loading';

export interface ResolvedScopeState {
  kind: ScopeStateKind;
  /** The scope the server reported, when it answered at all. */
  scope: ExplorerBrandScope | null;
  /** True only for `ready` and `unscoped` - the two states that may render rows. */
  mayRenderRows: boolean;
}

/**
 * Decide which state a response is in. Pure, so the rule is testable without
 * rendering anything, and so `mayRenderRows` is one expression rather than a
 * property of how four JSX branches happen to be written.
 */
export function resolveScopeState<T>(
  state: AsyncState<ScopedResponse<T>>,
  brandSelected: boolean
): ResolvedScopeState {
  if (state.loading) return { kind: 'loading', scope: null, mayRenderRows: false };

  if (state.error) {
    // A 403 with a brand selected is the membership state. A 403 with NO brand
    // selected is a genuine authorization failure and must not be dressed up as
    // configuration - there is nothing about an unscoped read for a membership
    // table to fix.
    const forbidden = statusOf(state.error) === 403;
    return {
      kind: forbidden && brandSelected ? 'unavailable' : 'failed',
      scope: null,
      mayRenderRows: false,
    };
  }

  const scope = state.data?.scope ?? null;

  // `data: null` inside a 200 is the server saying "this brand is not the one
  // Explorer's population belongs to". Zero rows, and it names the brand.
  if (state.data && state.data.data === null) {
    return { kind: 'out_of_scope', scope, mayRenderRows: false };
  }

  if (!state.data) {
    // Not loading, no error, no envelope. Unreachable, so it is reported rather
    // than rendered as a successful empty.
    return { kind: 'failed', scope, mayRenderRows: false };
  }

  if (scope?.reason === 'all_brands') {
    return { kind: 'unscoped', scope, mayRenderRows: true };
  }

  return { kind: 'ready', scope, mayRenderRows: true };
}

interface Props<T> {
  state: AsyncState<ScopedResponse<T>>;
  /** Whether a brand is currently selected in the workspace. */
  brandSelected: boolean;
  /** The selected brand's display name, for the out-of-scope message. */
  brandName?: string | null;
  onRetry?: () => void;
  /** Rendered ONLY in `ready` and `unscoped`. See the rule in the header. */
  children: (data: T, scope: ExplorerBrandScope) => React.ReactNode;
}

export default function ScopeState<T>({
  state,
  brandSelected,
  brandName,
  onRetry,
  children,
}: Props<T>) {
  const resolved = resolveScopeState(state, brandSelected);

  if (resolved.kind === 'loading') {
    return (
      <div className="text-center text-muted py-5" role="status" aria-live="polite">
        <div className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
        Loading…
      </div>
    );
  }

  if (resolved.kind === 'unavailable') {
    // STATE 2. Not red, because nothing is broken - and no rows, because the
    // only rows available are another brand's.
    return (
      <div className="alert alert-secondary d-flex align-items-start gap-2 my-3" role="status">
        <i className="ri-settings-3-line fs-5" aria-hidden="true" />
        <div>
          <div className="fw-semibold">
            Brand-scoped figures are unavailable: tenant memberships are not set up yet.
          </div>
          <div className="small mt-1">
            No per-brand numbers can be shown. Clear the brand selection to see the combined
            view, which is accurate for every brand together.
          </div>
        </div>
      </div>
    );
  }

  if (resolved.kind === 'out_of_scope') {
    // STATE 3. Names the brand, so "no population" cannot be misread as "the
    // page is broken" or as somebody else's numbers.
    const label = brandName?.trim() || 'This brand';
    return (
      <div className="text-center text-muted py-5">
        <i className="ri-inbox-line fs-3 d-block mb-2" aria-hidden="true" />
        <div>Explorer Growth covers Colaberry Training.</div>
        <div className="small mt-1">{label} has no explorer population yet.</div>
      </div>
    );
  }

  if (resolved.kind === 'failed') {
    // STATE 4. Red, named as a failure, carrying the reason - because a blank
    // panel invites the reader to conclude the calm explanation.
    const message = state.error?.message ?? 'No response was recorded for this panel.';
    const status = statusOf(state.error);
    return (
      <div className="alert alert-danger d-flex align-items-start gap-2 my-3" role="alert">
        <i className="ri-error-warning-line fs-5" aria-hidden="true" />
        <div className="flex-grow-1">
          <div className="fw-semibold">
            This request failed — the data below is not missing, it is unknown.
          </div>
          <div className="small mt-1">
            {message}
            {status !== null && <span className="ms-1 text-muted">(HTTP {status})</span>}
          </div>
          {onRetry && (
            <button type="button" className="btn btn-sm btn-outline-danger mt-2" onClick={onRetry}>
              <i className="ri-refresh-line me-1" aria-hidden="true" />
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  // `ready` and `unscoped` are the only states that reach the children, and
  // `mayRenderRows` is asserted here rather than trusted to the branch order
  // above: a fifth state added without a branch would fall through to this
  // point, and rendering rows for an unknown state is the failure mode this
  // whole component exists to prevent.
  if (!resolved.mayRenderRows || !state.data?.data) return null;

  /*
   * NO ALL-BRANDS BANNER HERE, and that is a correction.
   *
   * It used to render inside this component, so a tab with two panels showed the
   * same sentence twice and the Overview tab showed it twice before any data -
   * visible in a test's own DOM dump, which is how it was caught. The fact it
   * states is about the PAGE's brand selection, not about one panel, so
   * `GrowthJourneyPage` says it once above the tab body.
   *
   * `unscoped` stays a distinct kind rather than collapsing into `ready`,
   * because the page reads it and because "nothing is narrowed" and "this brand
   * was served" are different facts even when they render the same rows.
   */
  return <>{children(state.data.data, state.data.scope)}</>;
}
