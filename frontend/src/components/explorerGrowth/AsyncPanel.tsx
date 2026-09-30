import React from 'react';

/**
 * AsyncPanel — loading, empty and error rendered as three DIFFERENT things.
 *
 * This exists as a component rather than a convention because the rule is a
 * non-negotiable on every one of the six tabs, and a rule repeated by hand six
 * times is a rule that will be got right five times.
 *
 * ── WHY IT MATTERS HERE SPECIFICALLY ────────────────────────────────────────
 *
 * This programme has twice shipped a surface where an outage and an empty
 * result were indistinguishable. The event-registration badge showed nothing
 * for months while the code was correct and the query returned zero rows; the
 * Content tab's own backend would have 500'd on first contact and rendered as a
 * quiet, empty panel.
 *
 * A Command Center is a surface people consult to decide whether the system is
 * working. "No decisions today" and "the request failed" are opposite
 * conclusions, and a blank panel that could mean either is worse than an error,
 * because it invites the reader to conclude the calm one.
 */

export interface AsyncState<T> {
  loading: boolean;
  error: Error | null;
  data: T | null;
}

interface Props<T> {
  state: AsyncState<T>;
  /** True when the request succeeded but there is genuinely nothing to show. */
  isEmpty?: (data: T) => boolean;
  /** What "nothing to show" means here, in the reader's terms. */
  emptyMessage?: string;
  /** Optional hint under the empty message, e.g. "try clearing the filter". */
  emptyHint?: string;
  onRetry?: () => void;
  children: (data: T) => React.ReactNode;
}

export default function AsyncPanel<T>({
  state,
  isEmpty,
  emptyMessage = 'Nothing to show.',
  emptyHint,
  onRetry,
  children,
}: Props<T>) {
  if (state.loading) {
    return (
      <div className="text-center text-muted py-5" role="status" aria-live="polite">
        <div className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
        Loading…
      </div>
    );
  }

  if (state.error) {
    // Named as a FAILURE, with the reason, and visually distinct from empty.
    // The message is the error's own text: a generic "something went wrong"
    // sends the reader to look for a missing record instead of a broken call.
    return (
      <div className="alert alert-danger d-flex align-items-start gap-2 my-3" role="alert">
        <i className="ri-error-warning-line fs-5" aria-hidden="true" />
        <div className="flex-grow-1">
          <div className="fw-semibold">This request failed — the data below is not missing, it is unknown.</div>
          <div className="small mt-1">{state.error.message}</div>
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

  if (state.data === null) {
    // Not loading, no error, no data: a state that should be unreachable. Say
    // so rather than rendering nothing, which would look like a successful empty.
    return (
      <div className="alert alert-warning my-3" role="alert">
        No response was recorded for this panel. That is a bug, not an empty result.
      </div>
    );
  }

  if (isEmpty && isEmpty(state.data)) {
    return (
      <div className="text-center text-muted py-5">
        <i className="ri-inbox-line fs-3 d-block mb-2" aria-hidden="true" />
        <div>{emptyMessage}</div>
        {emptyHint && <div className="small mt-1">{emptyHint}</div>}
      </div>
    );
  }

  return <>{children(state.data)}</>;
}
