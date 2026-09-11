import React from 'react';

/**
 * NeedsAttentionQueue — what to look at next, and an honest account of what is not shown.
 *
 * Presentational. Takes the queue as props so every state is a prop combination.
 *
 * THE POSITIVE EMPTY STATE. An empty queue is GOOD NEWS and must read as such. A blank panel,
 * or a grey "No items", is indistinguishable from "nothing loaded" and from "the queue is
 * broken" - so an operator who has genuinely cleared everything gets no reward and no
 * confidence. The empty state here says, in words, that nothing needs attention.
 *
 * But only when that is actually true. If signals were EXCLUDED because their data is not
 * trusted, the empty state is qualified: "nothing needs attention among the signals we can
 * compute" is a different and weaker claim than "nothing needs attention", and the panel
 * says which one it is making.
 */

export interface AttentionItem {
  key: string;
  severity: 'action' | 'warning';
  title: string;
  count: number;
  href: string;
}

export interface ExcludedSignal {
  key: string;
  title: string;
  reason: string;
}

export interface NeedsAttentionQueueProps {
  loading: boolean;
  error: string | null;
  items: AttentionItem[];
  excluded: ExcludedSignal[];
  onRetry: () => void;
}

export default function NeedsAttentionQueue(props: NeedsAttentionQueueProps) {
  const { loading, error, items, excluded, onRetry } = props;

  if (loading) {
    return (
      <div className="text-center py-4 text-muted small" data-testid="attention-loading">
        Checking what needs attention...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-4" data-testid="attention-error">
        <div className="fw-semibold mb-1">Could not load the attention queue</div>
        <div className="small text-muted mb-2">
          {error} This is a failure to reach the server - it does not mean nothing needs attention.
        </div>
        <button type="button" className="btn btn-sm btn-outline-primary" onClick={onRetry}>Try again</button>
      </div>
    );
  }

  return (
    <div>
      {items.length === 0 ? (
        <div className="text-center py-4" data-testid="attention-empty">
          <i className="ri-checkbox-circle-line d-block mb-1 text-success" style={{ fontSize: '1.75rem' }} aria-hidden="true" />
          <div className="fw-semibold">
            {excluded.length === 0
              ? 'Nothing needs your attention'
              : 'Nothing needs your attention among the signals we can compute'}
          </div>
          <div className="small text-muted">
            {excluded.length === 0
              ? 'No pending approvals, no failed or overdue posts, no broken links.'
              : `${excluded.length} signal${excluded.length === 1 ? ' is' : 's are'} not checked yet - see below.`}
          </div>
        </div>
      ) : (
        <ul className="list-group list-group-flush" data-testid="attention-items">
          {items.map((item) => (
            <li key={item.key} className="list-group-item d-flex justify-content-between align-items-center">
              <span>
                <span className={`badge me-2 ${item.severity === 'action' ? 'bg-danger' : 'bg-warning text-dark'}`}>
                  {item.severity === 'action' ? 'Action' : 'Warning'}
                </span>
                {item.title}
              </span>
              <a className="small" href={item.href}>Open</a>
            </li>
          ))}
        </ul>
      )}

      {/* Exclusions are stated, not hidden. A shorter list that looks complete is the
          failure this exists to prevent - the operator must be able to see what the queue
          is NOT telling them and why. */}
      {excluded.length > 0 && (
        <div className="px-3 py-2 border-top small text-muted" data-testid="attention-excluded">
          <div className="fw-semibold mb-1">
            Not shown - data not trusted yet
          </div>
          <ul className="mb-0 ps-3">
            {excluded.map((e) => (
              <li key={e.key}>
                <span className="fw-medium">{e.title}:</span> {e.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
