import React from 'react';
import type { CollectionDiff, CompareResult } from '../../services/blueprintReviewApi';

/**
 * What changed between two blueprint revisions.
 *
 * EVERY OUTCOME GETS ITS OWN SECTION, which is the same discipline `ProjectLifecycleHeader`
 * applies to blocked-versus-not-assessed and for the same reason. "Nothing changed", "there is
 * only one revision", "this project has no blueprint" and "those collections could not be read"
 * are four different findings leading to four different actions. Rendering any of the last three
 * as a quiet empty list would show a reviewer an all-clear screen for a comparison that never
 * happened, and their name would end up on the approval.
 */

const hasChange = (c: CollectionDiff): boolean =>
  c.added.length > 0 || c.removed.length > 0 || c.revised.length > 0;

const IdList: React.FC<{ label: string; ids: string[]; tone: string; testid: string }> = ({
  label, ids, tone, testid,
}) => {
  if (ids.length === 0) return null;
  return (
    <div className="small mb-1" data-testid={testid}>
      <span className={`badge ${tone} me-2`}>{label} {ids.length}</span>
      {/* The IDS, not just the count. A count tells a reviewer something moved; the ids tell
          them what to go look at. */}
      <span className="text-muted">{ids.join(', ')}</span>
    </div>
  );
};

const CollectionRow: React.FC<{ diff: CollectionDiff }> = ({ diff }) => (
  <div
    className="border-bottom py-2"
    data-testid={`compare-collection-${diff.collection}`}
    data-identity={diff.identity}
  >
    <div className="fw-semibold small">{diff.collection}</div>
    <IdList label="added" ids={diff.added} tone="bg-success" testid={`compare-added-${diff.collection}`} />
    <IdList label="removed" ids={diff.removed} tone="bg-danger" testid={`compare-removed-${diff.collection}`} />
    {/* `revised` is kept visually distinct from added/removed because it is the change a
        reviewer is most likely to miss: the same requirement, re-pinned. */}
    <IdList label="revised" ids={diff.revised} tone="bg-warning text-dark" testid={`compare-revised-${diff.collection}`} />
  </div>
);

const BlueprintRevisionCompare: React.FC<{ result: CompareResult }> = ({ result }) => {
  if (result.state === 'no_manifest') {
    return (
      <div className="alert alert-secondary" data-testid="compare-no-manifest">
        This project has no operating blueprint yet, so there is nothing to compare.
      </div>
    );
  }

  if (result.state === 'single_revision') {
    return (
      <div className="alert alert-info" data-testid="compare-single-revision">
        Revision {result.only.revision} is the only revision. There is no earlier version to
        compare it against.
      </div>
    );
  }

  if (result.state === 'revision_not_found') {
    return (
      <div className="alert alert-warning" data-testid="compare-revision-not-found">
        <div className="fw-semibold">
          Requested revision{result.requested.length === 1 ? '' : 's'} {result.requested.join(' and ')} not found.
        </div>
        {/* The available list is what turns a refusal into a next step. */}
        <div className="small" data-testid="compare-available">
          Available: {result.available.length === 0 ? 'none' : result.available.join(', ')}
        </div>
      </div>
    );
  }

  if (result.state === 'disabled') {
    return (
      <div className="alert alert-warning" data-testid="compare-disabled">
        <div className="fw-semibold">{result.detail.error}</div>
        <div className="small">{result.detail.remedy}</div>
      </div>
    );
  }

  if (result.state === 'error') {
    return <div className="alert alert-danger" data-testid="compare-error">{result.message}</div>;
  }

  if (result.state !== 'compared' || !result.diff
    || !Array.isArray(result.diff.collections) || !Array.isArray(result.diff.unreadable)) {
    // UNREACHABLE AT THE TYPE LEVEL, reachable at runtime. The response arrives as JSON and is
    // cast, so a server older or newer than this page can hand it a state this build has never
    // heard of. Without this the next line dereferences `undefined` and the reviewer gets a
    // blank screen, which is the one outcome worse than an unhelpful message.
    return (
      <div className="alert alert-danger" data-testid="compare-unrecognized">
        The server returned a comparison this page does not recognise.
      </div>
    );
  }

  const changed = result.diff.collections.filter(hasChange);

  return (
    <div className="card border-0 shadow-sm mb-4" data-testid="compare-panel">
      <div className="card-header bg-white fw-semibold">
        <span data-testid="compare-range">
          Revision {result.from.revision} → {result.to.revision}
        </span>
      </div>
      <div className="card-body">
        {changed.length === 0 ? (
          <div className="text-muted small" data-testid="compare-unchanged">
            Nothing changed in any comparable collection between these two revisions.
          </div>
        ) : (
          <div data-testid="compare-changes">
            {changed.map((c) => <CollectionRow key={c.collection} diff={c} />)}
          </div>
        )}

        {result.diff.unreadable.length > 0 && (
          // ITS OWN SECTION, never folded into "unchanged". Silence here would read as
          // agreement about collections nobody was able to compare.
          <div className="alert alert-warning mt-3 mb-0" data-testid="compare-unreadable">
            <div className="fw-semibold small">
              Could not compare {result.diff.unreadable.length} collection
              {result.diff.unreadable.length === 1 ? '' : 's'}
            </div>
            <div className="small text-muted">{result.diff.unreadable.join(', ')}</div>
            <div className="small">
              These are not known to be unchanged. Treat this revision as un-reviewed until they
              can be read.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BlueprintRevisionCompare;
