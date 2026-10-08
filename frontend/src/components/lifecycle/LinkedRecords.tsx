import React from 'react';
import type { ConnectedGroup, LinkedResult } from '../../services/linkedRecordsApi';

/**
 * What connects to the record a reviewer selected.
 *
 * THE EMPTY STATES ARE THE POINT OF THIS COMPONENT. Most records in a blueprint today have no
 * recorded connections — the manifest pins which records exist and carries only three kinds of
 * edge — so "nothing to show" is the common answer, not the rare one. Rendering it as a blank
 * panel would tell a reviewer the record stands alone, which the manifest never says. Each cause
 * gets its own message:
 *
 *   - the id is not in this blueprint at all
 *   - the blueprint records no edge of that record's kind
 *   - this project has no blueprint yet
 *
 * This is the same discipline `ProjectLifecycleHeader` applies to `unmet` versus `not_assessed`,
 * and for the same reason: a reviewer who cannot tell "measured and absent" from "never recorded"
 * will read the first as the second.
 */

const TARGET_LABEL: Readonly<Record<ConnectedGroup['target'], string>> = {
  proposal_sections: 'Proposal sections',
  downstream_stories: 'Build stories',
  delivery_role: 'Accountable role',
};

const VIA_LABEL: Readonly<Record<ConnectedGroup['via'], string>> = {
  track_proposal_section: 'requirement → proposal section mapping',
  track_solution_story: 'requirement → story mapping',
  assignment_role: 'role named in the assignment',
};

const Group: React.FC<{ group: ConnectedGroup }> = ({ group }) => (
  <div className="border-bottom py-2" data-testid={`linked-group-${group.target}`}>
    <div className="d-flex align-items-baseline gap-2">
      <span className="fw-semibold small">{TARGET_LABEL[group.target]}</span>
      {/* The route the connection came through, so a reviewer can tell a traversed edge from a
          guess. An unlabelled link invites more trust than the data supports. */}
      <span className="text-muted" style={{ fontSize: '0.75rem' }} data-testid={`linked-via-${group.target}`}>
        via {VIA_LABEL[group.via]}
      </span>
    </div>
    <div className="small text-muted" data-testid={`linked-ids-${group.target}`}>
      {group.ids.join(', ')}
    </div>
  </div>
);

const LinkedRecords: React.FC<{ result: LinkedResult; entityId: string }> = ({ result, entityId }) => {
  if (result.state === 'no_manifest') {
    return (
      <div className="alert alert-secondary" data-testid="linked-no-manifest">
        This project has no operating blueprint yet, so it has no records to connect.
      </div>
    );
  }

  if (result.state === 'disabled') {
    return (
      <div className="alert alert-warning" data-testid="linked-disabled">
        <div className="fw-semibold">{result.detail.error}</div>
        <div className="small">{result.detail.remedy}</div>
      </div>
    );
  }

  if (result.state === 'error') {
    return <div className="alert alert-danger" data-testid="linked-error">{result.message}</div>;
  }

  if (result.state !== 'linked' || !Array.isArray(result.groups)) {
    // Unreachable at the type level, reachable at runtime: the response is JSON and is cast, so
    // a server on a different build can send a state this page has never heard of.
    return (
      <div className="alert alert-danger" data-testid="linked-unrecognized">
        The server returned a result this page does not recognise.
      </div>
    );
  }

  return (
    <div className="card border-0 shadow-sm mb-4" data-testid="linked-panel">
      <div className="card-header bg-white fw-semibold">
        Connected to <span data-testid="linked-entity">{entityId}</span>
        {result.entity !== null && (
          <span className="badge bg-secondary ms-2" data-testid="linked-view-kind">
            {result.entity.viewKind}
          </span>
        )}
      </div>
      <div className="card-body">
        {result.groups.length > 0 ? (
          <div data-testid="linked-groups">
            {result.groups.map((g) => <Group key={`${g.target}:${g.via}`} group={g} />)}
          </div>
        ) : (
          <div
            className="alert alert-info mb-0"
            data-testid={`linked-${result.unlinked?.kind ?? 'unexplained'}`}
          >
            {/* The server's own explanation, not a generic phrase invented here. If it ever
                arrives without one, that absence is visible rather than papered over. */}
            <div className="small">
              {result.unlinked?.detail
                ?? 'No connected records, and the server did not say why. Treat this as unknown.'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LinkedRecords;
